import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://www.admiral-post.com",
  "https://admiral-post.com",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function response(body: unknown, status = 200, origin = "") {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  });
  if (allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

const clean = (v: unknown, max = 500) => typeof v === "string" ? v.trim().slice(0, max) : "";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return response({}, 200, origin);
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405, origin);
  if (!allowedOrigins.has(origin)) return response({ error: "Origin not allowed" }, 403, origin);

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response({ error: "JSON required" }, 415, origin);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 12000) return response({ error: "Request too large" }, 413, origin);
    body = JSON.parse(raw);
  } catch {
    return response({ error: "Invalid request" }, 400, origin);
  }

  // Honeypot: quietly accept bot submissions without storing them.
  if (clean(body.website, 200)) return response({ ok: true }, 200, origin);

  const customer_name = clean(body.name, 120);
  const phone = clean(body.phone, 50);
  const email = clean(body.email, 254).toLowerCase();
  const destination = clean(body.country, 100);
  const weight_kg = Number(body.weight);
  const contents = clean(body.contents ?? body.type, 500);
  const message = clean(body.message, 2000);
  const language = body.language === "en" ? "en" : "ru";
  const consent = body.consent === true || body.agree === true;

  if (!customer_name || !phone || !email || !destination || !consent ||
      !Number.isFinite(weight_kg) || weight_kg <= 0 || weight_kg > 1000 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response({ error: "Please check the required fields." }, 400, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing server-side Supabase configuration");
    return response({ error: "Service is not configured yet. Please contact us by WhatsApp or email." }, 503, origin);
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Best-effort rate limit: 8 submissions per 15 minutes per hashed IP.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + supabaseUrl));
  const ip_hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data: limit } = await db.from("request_rate_limits").select("window_started_at,request_count").eq("ip_hash", ip_hash).maybeSingle();
  const now = Date.now();
  if (limit && now - new Date(limit.window_started_at).getTime() < 15 * 60 * 1000 && limit.request_count >= 8) {
    return response({ error: "Too many requests. Please try again later or contact us directly." }, 429, origin);
  }
  const nextCount = limit && now - new Date(limit.window_started_at).getTime() < 15 * 60 * 1000 ? limit.request_count + 1 : 1;
  const { error: rateError } = await db.from("request_rate_limits").upsert({
    ip_hash,
    window_started_at: limit && now - new Date(limit.window_started_at).getTime() < 15 * 60 * 1000 ? limit.window_started_at : new Date().toISOString(),
    request_count: nextCount,
  });
  if (rateError) console.error("Rate-limit write failed", rateError.message);

  const { error } = await db.from("quote_requests").insert({
    source: "website", language, customer_name, phone, email, destination,
    weight_kg, contents, message, consent, status: "new",
  });
  if (error) {
    console.error("Quote insert failed", error.message);
    return response({ error: "We could not save your request. Please contact us by WhatsApp or email." }, 500, origin);
  }
  return response({ ok: true, message: language === "en" ? "Thank you. Your request has been sent to our team." : "Спасибо! Заявка отправлена нашей команде." }, 201, origin);
});
