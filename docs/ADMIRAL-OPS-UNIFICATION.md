# AdmiralPost → unified AlilPost Ops model (migration plan, NOT deployed)

Status: design / pre-production. The public website, order data and existing Supabase Edge Functions are unchanged. This branch intentionally contains no runtime cutover.

## Confirmed from code and server metadata (2026-11-16)

- Both projects use the self-hosted PostgreSQL 17.6 in Docker \`supabase-db\`, database \`postgres\`, via \`https://supabase.alilpost.ge\`. No server/database copy is needed.
- The current AdmiralPost form POSTs to the self-hosted Edge Function \`/functions/v1/submit-quote\`. Existing records are stored in \`public.quote_requests\`.
- Trigger \`quote_to_ops\` exists on \`public.quote_requests\`, and \`admiral_integrations.enqueue_ops\`, \`deliver_ops\`, \`ops_outbox\` exist. Exact trigger/function behavior and production delivery state still require read-only verification.
- \`public.ops_orders\` already has \`brand='admiral'\` support and \`source\`, \`external_ref\`. The Ops repo has \`ops-intake\` and a unique index on \`(brand,source,external_ref)\`.
- AdmiralPost \`account.html\` reads \`quote_requests\` for customer order history and uses \`customer_profiles\`, \`customer_addresses\`. The site \`admin.html\` reads and updates \`quote_requests\`; it also manages other functions. These cannot be switched casually.
- Chat \`admiral-chat.js\` already references the self-hosted \`ops-chat\` Edge Function.
- There is a shared \`postgres\` DB but not yet one canonical order data model.

## Decision

For **future orders**, make \`public.ops_orders\` the canonical order, while preserving AdmiralPost's existing account identities, addresses, UI, chat, and historical records. Do **not** simply make the browser insert into \`ops_orders\`. All writes go through a trusted server-side API/Edge Function with constrained credentials and explicit brand authorization. Avoid exposing API keys or service role in browser JavaScript.

**Old \`quote_requests\` rows must be preserved** until history reconciles and all dependent UIs stop requiring them. Handle a quote/lead versus accepted logistics order explicitly, rather than forcing every inquiry into an order.

## Proposed safe cutover stages

1. **Read-only audit** of live PostgreSQL column types, RLS, triggers, existing order counts by brand, constraints, and edge-function deployment. Identify actual \`submit-quote\` runtime code (not present in the current AdmiralPost repo).
2. **Write canonical field mapping**: every form field, mandatory pickup address/date, weight/qty, consent, email, estimated price, request number, contact, account link, status, and operator notes. Decide optional/custom attributes before changing DB.
3. **Ops-owned migrations**: add backward-compatible fields/relations/functions where justified, with documented constraints, permissions and journal. Run on TEST clone with backup.
4. **Trusted intake**: \`submit-quote\` or its replacement validates all inputs, creates one \`ops_orders\` row with \`brand='admiral'\`, \`source='site'\`, a stable idempotency reference, and returns a safe public confirmation number. Reuse appropriate existing \`ops-intake\` internals only with server-side authorization. **Never** call \`ops-intake\` from client JS with an embedded API key.
5. **Customer visibility**: add a brand-scoped, authenticated read endpoint/function using Supabase Auth JWT; never allow customers to read other customers' orders. Test account ownership and deletion.
6. **AdmiralPost admin UI**: read/update order data via appropriately scoped Ops API/RPC; preserve access control, no admin privilege escalation.
7. **Eva/chat**: verify its current Ops chat path and any order-creation interactions; ensure no second order is created for the same customer action.
8. **Historical reconciliation**: compare \`quote_requests\` ↔ \`ops_orders\` via stable old/new references. Migrate only missing records, preserving original IDs/reference mapping and status; dry-run counts and mismatches first. Don't delete original records.
9. **Controlled test**: backup/restore rehearsal; new order, repeat-click/retry, unauthenticated customer, signed-in customer, personal history, operator workflow, chatbot, and zero duplicate outbox entries.
10. **Cutover** under a temporary feature flag. Disable the legacy \`quote_to_ops\`/outbox pathway **only after** the new route is independently proven and outstanding outbox items reconciled. Monitor failures; provide rollback plan.
11. **After stabilization**, design shared automated GitHub SQL/code deploy with backup-before-migrations, ordered Ops + AdmiralPost migrations, a journal and explicit Edge Function deployment. This is a separate activation.

## Critical boundaries

- The migration and trigger code must not run with blanket \`postgres\` privileges in CI.
- Existing \`ops_*\` tables belong to Ops; schema updates land in the Ops repo with coordinated compatibility checks.
- Production order/account records and the existing admin site must stay functional during the transition.
- Old cloud Supabase is outside scope.
- Do not merge this branch or deploy until the real database/Edge Function contract is confirmed.
