const allowedOrigins = new Set([
  "https://www.admiral-post.com",
  "https://admiral-post.com",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const responseHeaders = (origin: string) => {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  });
  if (allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "content-type, apikey");
  }
  return headers;
};
const reply = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
const clean = (value: unknown, max = 100) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

let cachedToken = "";
let tokenExpiresAt = 0;
const recentRequests = new Map<string, number[]>();
// This in-memory limiter is best-effort per instance; add gateway rate limiting for production-scale abuse protection.

async function getMeestToken(baseUrl: string, username: string, password: string): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  const authResponse = await fetch(baseUrl + "/auth", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(12_000),
  });
  const authBody = await authResponse.json().catch(() => null);
  const token = authBody?.result?.token ?? authBody?.token;
  if (!authResponse.ok || (authBody?.status != null && String(authBody.status).toUpperCase() !== "OK") || typeof token !== "string" || !token) {
    console.error("Meest authentication failed", authResponse.status, authBody?.status ?? "no-status");
    throw new Error("Meest authentication failed");
  }
  const expiresIn = Number(authBody?.result?.expiresIn ?? 3600);
  cachedToken = token;
  tokenExpiresAt = Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000;
  return cachedToken;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(origin) });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);
  if (!allowedOrigins.has(origin)) return reply({ error: "Origin not allowed" }, 403, origin);
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return reply({ error: "JSON required" }, 415, origin);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 1000) return reply({ error: "Request too large" }, 413, origin);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid request" }, 400, origin);
  }

  const trackNumber = clean(body.trackNumber, 80);
  if (!trackNumber || !/^[A-Za-z0-9-]+$/.test(trackNumber)) return reply({ error: "Please enter a valid tracking number." }, 400, origin);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const timestamps = (recentRequests.get(ip) ?? []).filter((time) => now - time < 60_000);
  if (timestamps.length >= 20) return reply({ error: "Too many requests. Please try again in a minute." }, 429, origin);
  timestamps.push(now);
  recentRequests.set(ip, timestamps);

  const username = Deno.env.get("MEEST_API_USERNAME");
  const password = Deno.env.get("MEEST_API_PASSWORD");
  if (!username || !password) {
    console.error("Meest tracking credentials are not configured");
    return reply({ error: "Tracking is being configured. Please try again later or contact our support team." }, 503, origin);
  }

  const baseUrl = (Deno.env.get("MEEST_API_BASE_URL") ?? "https://api.meest.com/v3.0/OpenAPI").replace(/\/$/, "");
  try {
    let token = await getMeestToken(baseUrl, username, password);
    let trackingResponse = await fetch(baseUrl + "/tracking/" + encodeURIComponent(trackNumber), {
      method: "GET",
      headers: { "Accept": "application/json", "token": token },
      signal: AbortSignal.timeout(15_000),
    });
    if (trackingResponse.status === 401 || trackingResponse.status === 403) {
      cachedToken = "";
      tokenExpiresAt = 0;
      token = await getMeestToken(baseUrl, username, password);
      trackingResponse = await fetch(baseUrl + "/tracking/" + encodeURIComponent(trackNumber), {
        method: "GET",
        headers: { "Accept": "application/json", "token": token },
        signal: AbortSignal.timeout(15_000),
      });
    }

    const trackingBody = await trackingResponse.json().catch(() => null);
    if (!trackingResponse.ok) {
      console.error("Meest tracking request failed", trackingResponse.status);
      return reply({ error: trackingResponse.status === 404 ? "Shipment not found." : "Tracking service is temporarily unavailable." }, trackingResponse.status === 404 ? 404 : 502, origin);
    }
    if (!trackingBody || String(trackingBody.status ?? "").toLowerCase() !== "ok" || !Array.isArray(trackingBody.result)) {
      return reply({ error: "No tracking information was found for this number." }, 404, origin);
    }

    const events = trackingBody.result.map((item: Record<string, unknown>) => ({
      parcelNumber: clean(item.parcelNumber, 80),
      barCode: clean(item.barCode, 80),
      eventDateTime: clean(item.eventDateTime, 40),
      eventCode: Number(item.eventCode),
      eventCodeUPU: clean(item.eventCodeUPU, 10),
      eventPlaces: clean(item.eventPlaces, 30),
      eventCountryDescr: item.eventCountryDescr && typeof item.eventCountryDescr === "object" ? item.eventCountryDescr : {},
      eventCityDescr: item.eventCityDescr && typeof item.eventCityDescr === "object" ? item.eventCityDescr : {},
      eventDescr: item.eventDescr && typeof item.eventDescr === "object" ? item.eventDescr : {},
      eventDetailDescr: item.eventDetailDescr && typeof item.eventDetailDescr === "object" ? item.eventDetailDescr : {},
    })).sort((a: { eventDateTime: string }, b: { eventDateTime: string }) => b.eventDateTime.localeCompare(a.eventDateTime));

    return reply({ status: "ok", parcelNumber: events[0]?.parcelNumber || trackNumber, barCode: events[0]?.barCode || "", result: events }, 200, origin);
  } catch (error) {
    console.error("Meest tracking integration error", error instanceof Error ? error.message : "unknown error");
    return reply({ error: "Tracking service is temporarily unavailable. Please try again later." }, 502, origin);
  }
});
