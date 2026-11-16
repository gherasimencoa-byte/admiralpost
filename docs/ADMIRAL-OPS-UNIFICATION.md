# AdmiralPost → direct AlilPost Ops orders

Status: **draft, not deployed**. Production remains unchanged until new order intake, customer history, admin access, and deployed Edge Function behavior pass testing.

## Decision (2026-11-16)

The operator confirms **all existing AdmiralPost orders are already in AlilPost Ops**. **Do not import, backfill, merge, copy, or duplicate historical orders.** This project is a **connection/cutover**, not a database transfer.

Both applications already use the same physical PostgreSQL 17.6 Docker service \`supabase-db\`, database \`postgres\`, through the self-hosted \`https://supabase.alilpost.ge\` endpoint.

The goal is to write **new orders directly to \`public.ops_orders\`** with \`brand='admiral'\`, while keeping the customer-facing website and accounts. Retain legacy \`quote_requests\` and the outbox as a read-only archive until downstream dependencies are checked; no order history migration is authorized.

## Actual runtime dependencies verified from GitHub

- The website currently submits to \`/functions/v1/submit-quote\`, which has not yet been recovered as deployed source code from the server. Do not overwrite this function blindly.
- \`account.html\` reads \`public.quote_requests\` by \`customer_user_id\`.
- \`admin.html\` reads and updates \`public.quote_requests\`; also uses \`shipments\` and \`admiral_change_admin\`. Do not break admin actions unintentionally.
- \`admiral-chat.js\` already uses the self-hosted \`/functions/v1/ops-chat\`.
- Existing database: \`public.quote_requests\`, \`admiral_integrations.ops_outbox\`, trigger \`quote_to_ops\` and \`admiral_integrations.enqueue_ops\` / \`deliver_ops\`.
- Ops service \`ops-intake\` supports \`brand='admiral'\`, \`source='site'\` and external idempotency references, but accepts an **x-api-key which must never appear in browser files**.

## Exact field mapping for new website pickup requests

| AdmiralPost form | Ops orders | Notes |
| --- | --- | --- |
| \`name\` | \`client_name\` | Required; validate server-side |
| \`phone\` | \`client_phone\` | Required; validate server-side |
| \`email\` | \`client_email\` | Optional in pickup form |
| \`country\` | \`destination_country\` | Normalize country |
| \`weight\` | \`weight\` | Decimal kilograms, positive |
| \`pickup_city\` | \`city_text\` | Pickup city |
| \`pickup_address\` | \`address\` | Pickup address |
| \`pickup_date\` | \`planned_date\` | Date in local pickup timezone |
| \`type\` / \`kind\` | \`order_type='pickup'\` | Review current enumerations |
| \`message\` | \`client_comment\` or \`comment\` | Preserve client message; \`comment\` may include operational details |
| \`estimated_price\` | **not yet mapped to final \`price\`** | Estimate vs final payable price differ; do not silently charge/lock a tariff |
| \`agree\` | privacy/consent verification | Consent is validated on intake, not blindly trusted; record audit if required |
| \`language\` | optional site-specific metadata | Not a known column; retain only if justified |
| (server generated) | \`brand='admiral'\`, \`source='site'\`, \`status='new'\` | Never accept brand/privileged state from browser |
| (stable request UUID) | \`external_ref\` | Idempotent retry; unique by \`brand,source,external_ref\` |
| (server-generated) | \`ops_orders.id\` | Confirmation ID, not old \`quote_requests.request_number\` |

User-provided schema inventory confirms \`public.ops_orders\` has all the main customer/address/destination/date fields needed for pickup; it has no \`customer_user_id\` column. Therefore **customer order visibility still needs an authenticated linkage**, even though orders are already in the same DB.

## No historical order movement

- Never INSERT historical \`quote_requests\` into \`ops_orders\`.
- Never rewrite or delete existing \`ops_orders\`, \`quote_requests\` or \`ops_outbox\` merely because the new website route is enabled.
- Existing orders can remain referenced by their Ops IDs. Any website account history view must use a verified authorization mapping, not infer identity from a phone number.
- Old quote numbers and new Ops IDs are different types; do not claim they are identical.
- If website needs to show pre-existing orders, audit existing account-to-order linkage. Create a **linking method only**, not a history import.

## Cutover checklist (test first)

1. Read-only audit the actual deployed \`submit-quote\` Edge Function, current trigger/outbox delivery activity and \`ops_orders\` RLS. Count duplicate target orders; do not manipulate rows.
2. Add one server-side intake function, authenticated as server, that validates client fields, uses stable idempotency, and writes \`ops_orders\` once. No service role or integration key in client JS. Preserve security/spam protections and necessary notifications from existing function.
3. Add authenticated customer history reader with an explicit user/order link and brand boundaries.
4. Adapt AdmiralPost admin list/actions to the Ops order model, keeping the separate \`shipments\`/owner-access features working. Check status mappings; Ops statuses differ from quote statuses.
5. Keep Eva chat integration; verify chat creates no duplicate order.
6. Deploy intake and account-read functions to Production, backup, test duplicate clicks, anonymous/authenticated customer, operator visibility, admin permissions and rollback.
7. **Only then** switch website UI to the new intake and Ops account/admin endpoints. The old \`quote_requests\` trigger remains idle when no longer inserting there; disable legacy outbox delivery only after checking pending items.
8. Validate real end-to-end intake and website/ops reads, monitor, retain rollback path.

## After successful cutover

Then implement coordinated Github website + Ops SQL/Edge Function deploy with DB backup, migration journal, tested rollbacks and pre-release compatibility. This is **not** done yet. New frontend commits must not deploy automatically until their dependent functions/DB changes are already deployed and tested.

## Architecture correction: use the existing AlilPost.ge pattern (2026-11-16)

Verified against **\`icetii/Alilpost-GE\` main** files \`migrations/ops_0001_shared_orders.sql\`, \`public/crm/lib/ops-order.php\`, \`public/crm/lib/customers.php\`:

- AlilPost.ge does **not** add a \`customer_user_id\` to \`public.ops_orders\`.
- It stores the canonical order in \`ops_orders\` and a \`alilpost_site.order_details\` record keyed by that order id.
- It stores the optional authenticated customer link in \`alilpost_site.customer_order_links(order_id bigint, customer_id bigint)\`; site PHP customer views JOIN these by session customer ID.
- The site's PostgreSQL \`create_site_order\` function performs order creation and supplemental metadata insertion under one transaction, guarded by an idempotency request key.
- AdmiralPost uses **Supabase Auth UUID user IDs**, not AlilPost.ge's self-managed bigint \`customer_accounts.id\`. Reuse the **pattern**, not its exact code or foreign-key type.

**Proposed minimal AdmiralPost linkage** (to review against current live authentication/RLS/grants first):
\`admiral_site.customer_order_links(order_id bigint PRIMARY KEY REFERENCES public.ops_orders(id), user_id uuid NOT NULL REFERENCES auth.users(id))\`.
Create link on an authenticated order submission, based on verified JWT identity (never a client-supplied UUID). For anonymous submissions retain order without an account link until a secure ownership-verification flow exists. The customer read endpoint must filter by verified \`auth.uid()\` and \`brand='admiral'\`; no raw phone/email-based owner assertions.

No extra column needs to be added to \`public.ops_orders\` for customer linkage. Add \`admiral_site.order_details\` only if required for site-specific request fields, tracking, or the idempotency handshake. New \`ops_orders\` already has the necessary normal pickup fields including \`client_email\` and \`client_comment\`.

## Production-only deployment decision (2026-11-16)

The operator explicitly chose **no separate TEST deployment**. Adapt the plan:

1. Read-only inspect actual running \`submit-quote\` function and shared DB security/trigger conditions on Production.
2. Create and verify a restorable pre-change full PostgreSQL 17 backup and website/Edge Function code backup; retain old deployment files and original code.
3. Apply only reversible, additive schema/function changes on Production; do **not** delete historical rows or change the legacy outbox while old website still uses it.
4. Deploy the new Ops intake/read logic first under a new endpoint or a disabled route, without affecting current submissions.
5. Switch the AdmiralPost site atomically to the new route, preserving rollback to the old site+function. Never expose server-side keys.
6. Run **minimal monitored production smoke checks**, including a controlled order creation marked for reconciliation, retry idempotency, customer-privacy access, admin access and operator visibility. Remove/close any test-generated business order according to the existing operator workflow; never leave an unidentified live job.
7. After monitoring and verifying no duplicate outbox delivery, retire the legacy *write path*. Preserve old tables/data.

**Skipping TEST is not the same as skipping validation.** If any prerequisite/backup/recoverability check fails, abort the live switch.

## Deployed submit-quote source review (2026-11-16, read-only excerpt)

Operator pasted the active source from \`/opt/supabase/volumes/functions/submit-quote/index.ts\` (as of 2026-11-16). Current code:

- Imports \`@supabase/supabase-js@2\`, allows \`https://admiral-post.com\` and \`https://www.admiral-post.com\` (plus localhost development origins), responds to preflight and requires JSON POST.
- Caps request body at 12 KB, honors honeypot field \`website\`, validates \`name\`, \`phone\`, \`email\`, \`country\`, \`weight\`, \`agree/consent\`, reads \`contents ?? type\`, \`message\`, \`language\`.
- Uses server-side Supabase service role/secret key from environment, then a best-effort 8-requests-in-15-minutes hashed-IP counter in \`public.request_rate_limits\`.
- **Writes to \`public.quote_requests\` only**, with \`source='website'\`, \`status='new'\`; no direct \`ops_orders\` call and no order/account link.
- Accepts \`Authorization\` header from the website but the function does **not** call \`auth.getUser(token)\` to validate signed-in identity; a new authenticated order must derive user UUID from a validated token, not caller JSON.
- **Pickup city/address/date are not independently saved** by the function; the website includes them in the \`message\` text. New canonical Ops mapping should write them to \`city_text\`, \`address\`, \`planned_date\`.
- Current function requires **email**, while the active website's form notes that email is optional for pickup. Resolve this mismatch during direct-intake validation.
- Current rate limiting is best effort: failing to update \`request_rate_limits\` does not block intake. Server-side secret/salt use and header trust require review, but no change to production until guarded rollout.
- The \`quote_to_ops\` database trigger currently creates a risk of double orders if new direct intake is added without disabling the legacy write *for new requests*. Do not create a new quote and a direct Ops order for the same submission.
- Return a compatible success message and safe order confirmation; existing deployed response is \`201\` with \`ok: true\` and localized \`message\`.

There is no evidence from the pasted excerpt of a notification handler, pricing validation or a specific background outbox scheduler; inspect those separately rather than assuming they exist.

Before coding direct intake, inspect live constraints/RLS/triggers of \`public.ops_orders\`, and the actual \`quote_to_ops\` definition and pending queue without exposing any customer rows or secrets.

**Do not change production now**. User explicitly chooses no separate TEST environment, but preflight and full restorable backup are still required for a controlled production cutover.
