# Public consultant

The widget on the three homepages and destination pages opens `/consultant.html`.
The interface is Russian; the model answers in the customer's language.
The administrator pilot remains separate at `/consultant-ai.html`.

## Operations

- The public Edge Function is `consultant-public`. It imports the same knowledge JSON and pricing module as the pilot.
- To change business rules, edit `supabase/functions/consultant-pilot/knowledge.json`, add dialogue cases, test in the pilot, and deploy BOTH functions. Imports are bundled at deployment time.
- Conversations do not automatically train the model. Review messages in `admin-dialogues.html` and approve new rules explicitly.
- A model tool can prefill the editable application form. Only a customer submission with consent creates a quote request. The server returns the actual request number.
- Conversations and quote requests are linked and visible in the existing admin interface. This release does not deliver operator replies to visitors or send declaration emails. WhatsApp is the human support route. The PDF is a public link.
- The browser keeps a random 256-bit session capability in sessionStorage; only its SHA-256 hash is stored on the server. Server history remains private to that capability for seven days and to authorized admins. No anon/authenticated table access is granted to session or rate tables.
- Limits: 10 new sessions/IP/hour, 40 AI turns/IP/hour, 500 AI turns globally per 24-hour window, 30 turns/conversation. These are conservative initial limits; reaching one leaves the order form and WhatsApp available. Limit checks fail closed.
- Each turn allows at most three model calls with 1200 output tokens each. Requests have a session lock and idempotent request ID. Quote submission is transactional and idempotent by conversation.
- Error messages do not reveal provider errors, keys, or customer data. `verify_jwt=false` is intentional: the public endpoint authenticates visitor sessions using the capability; admin-only pilot authentication remains unchanged.

## Checks

Run `node tests/public-consultant.cjs`, `deno check supabase/functions/consultant-public/index.ts`, and `tests/public-consultant.sql` in a transaction. Live smoke checks should use synthetic data and remove only the resulting test conversation/request afterward.

## Disable

Remove `/consultant-widget.js` script includes to hide the entry point. For an immediate backend pause, disable the public function in Supabase. Do not disable the admin pilot or remove stored conversations.
