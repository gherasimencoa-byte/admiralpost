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
6. Deploy intake and account-read functions to TEST, backup, test duplicate clicks, anonymous/authenticated customer, operator visibility, admin permissions and rollback.
7. **Only then** switch website UI to the new intake and Ops account/admin endpoints. The old \`quote_requests\` trigger remains idle when no longer inserting there; disable legacy outbox delivery only after checking pending items.
8. Validate real end-to-end intake and website/ops reads, monitor, retain rollback path.

## After successful cutover

Then implement coordinated Github website + Ops SQL/Edge Function deploy with DB backup, migration journal, tested rollbacks and pre-release compatibility. This is **not** done yet. New frontend commits must not deploy automatically until their dependent functions/DB changes are already deployed and tested.
