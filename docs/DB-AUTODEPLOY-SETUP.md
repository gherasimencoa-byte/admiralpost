# AdmiralPost: automatic PostgreSQL migrations — setup checkpoint

## State

- Website auto-deployment is active and independently verified.
- A **read-only** GitHub Actions database preflight checks server tools/listeners.
- SQL migration naming/checksum validation is available in `scripts/validate_migrations.py`.
- **Production SQL migrations are NOT enabled.** Do not claim otherwise.

## Read-only preflight

GitHub Actions workflow: `.github/workflows/admiral-db-preflight.yml`.
It runs on `setup-admiralpost-db-migrations-20261116`, checks basic host setup and PostgreSQL tooling, and does **not** run SQL, inspect customer records, or alter Nginx/site files.

## Findings to verify in live configuration

The AdmiralPost website currently points at `https://supabase.alilpost.ge`, but this URL alone does not establish the PostgreSQL database name or the owner of its tables/functions.

Before assigning privileges or running migrations, determine:

1. The exact PostgreSQL database behind that Supabase endpoint.
2. Schemas and tables/functions **owned by AdmiralPost**, especially `quote_requests`, `customer_profiles`, `submit-quote`.
3. Which components are implemented as Supabase Edge Functions (SQL migration alone will NOT update their deployed code).
4. Whether other sites/AlilPost Ops share the database; permissions must prevent cross-project writes.
5. Where encrypted/off-server DB backups live; verify at least one restore to a test DB.
6. How the existing root-owned `/usr/local/sbin/admiralpost-deploy` manages file backups, locks and rollback.

## Safe production activation design

- Add an owner-approved migration DB account scoped only to known AdmiralPost objects.
- Create a DB migration journal with primary key on migration filename; also store checksum and Git commit.
- Use the existing deployment lock and a DB advisory lock; reject modified migration history.
- Verify the release bundle integrity and SQL file hashes before executing anything.
- Run `pg_dump --format=custom` of the **correct** database after verifying access, restoreability and backup storage.
- Run migrations in sorted order, one transaction per file. Write journal entries in the same transaction.
- On failure: halt publication; stop further SQL. Reverse incomplete transactional changes. Do **not** assume that PostgreSQL changes already committed in previous migrations are automatically reverted.
- After success: publish the website and run website + DB health checks; retain backups.
- For dangerous changes (DROP, destructive rewrite), require separately reviewed multi-phase migrations.
- Never put PostgreSQL credentials or production data in the GitHub repository or CI logs.
- The final workflow must fail closed if DB preflight/backup/migrations fail. **No silent skip** of migrations.

## Activation gate

Do not merge an active migration trigger, alter the production installer, or create DB access secrets until the target DB, authorized migration role, restore-tested backups, and TEST rehearsal are confirmed. After that, a separate reviewed PR can enable automatic deployment of both site and SQL on every push to `main`.

## Verified read-only host findings (2026-11-16)

GitHub Actions read-only SSH probe completed successfully:

- The local Ubuntu PostgreSQL cluster is `16/main` (online, port `5432`).
- Also a localhost TCP listener at `127.0.0.1:6543`.
- `psql`, `pg_dump`, `pg_restore` are version 16.15.
- The `admiralpost-deploy` account can read `/srv/admiralpost/current` and invoke ONLY the existing sudo deployment script.
- That account cannot log into PostgreSQL through a local socket or `127.0.0.1:5432` without credentials.
- It cannot query Docker containers, and the root-owned installer is intentionally unreadable.
- **No DB data, schema or role has been changed.**

**Do not equate the localhost PostgreSQL with the Supabase endpoint without checking NGINX proxy and container/database wiring with administrator permissions.** The site URL alone is not sufficient evidence.

### One-time administrator inspection, read only

Run these commands on the server using an administrator account; review output for secrets before sharing:

```bash
sudo pg_lsclusters
sudo -u postgres psql -X -A -t -c "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;"
sudo docker ps --format '{{.Names}} {{.Image}}'
sudo nginx -T 2>/dev/null | grep -n -A 18 -B 4 'server_name supabase.alilpost.ge'
```

Check which PostgreSQL database serves the actual Supabase API, and how AdmiralPost-specific tables/functions map into it. Do not run any SQL DDL, DML, grant, or dump until reviewed.

## Important correction: Supabase runs PostgreSQL 17 in Docker

On 2026-11-16, the administrator confirmed:

- `sudo pg_lsclusters` shows the **separate host PostgreSQL 16/main on port 5432**.
- Docker has `supabase-db` image `supabase/postgres:17.6.1.136`, `supabase-rest`, `supabase-edge-functions`, `supabase-envoy` and other Supabase services.
- NGINX for `supabase.alilpost.ge` proxies `/rest/v1`, `/auth/v1`, `/functions/v1` and other Supabase API paths to `127.0.0.1:8000`.

**Never run AdmiralPost migrations or database backups against the host PostgreSQL 16 merely because port 5432 is listening.** The likely target is the PostgreSQL 17 Docker container `supabase-db`, subject to confirmation of the actual Supabase connection and database ownership. Docker `exec` must be allowed only for the dedicated, constrained server-side installer, not through a broad `sudo docker` grant to the GitHub deploy account.

### Next administrator discovery (read-only, no records)

Run from the Scaleway server administrator shell:

```bash
sudo docker exec -u postgres supabase-db \
  psql -X -w -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT current_database() AS database_name, current_user AS connected_as, current_setting('server_version') AS pg_version;" \
  -c "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;" \
  -c "SELECT n.nspname AS schema_name, c.relname AS object_name, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v') AND (c.relname ILIKE '%quote%' OR c.relname ILIKE '%customer%' OR c.relname ILIKE 'ops_%' OR n.nspname ILIKE '%admiral%') ORDER BY n.nspname,c.relname LIMIT 80;"
```

This is metadata only; it does not read customer rows or modify any table. If local connection authentication fails, stop and report the error without sharing passwords or credentials.

**Critical**: An Edge Function such as `submit-quote` has its own deployed code; SQL migrations do not automatically update it. The final solution must coordinate any AdmiralPost function deployments with the site+DB version.

## Verified PostgreSQL database inventory (operator, 2026-11-16)

Administrator read-only results from `sudo docker exec -u postgres supabase-db psql ...`:

- Container PostgreSQL version: **17.6**.
- Non-template databases: **`postgres`** and **`_supabase`**.
- The `postgres` database contains `public.quote_requests`, `public.customer_profiles`, `public.customer_addresses`, `admiral_integrations.ops_outbox`, plus AlilPost and Ops tables.
- `_supabase` has none of the searched AdmiralPost/Ops/customer tables.
- The **candidate target** for AdmiralPost-specific migrations is Docker `supabase-db`, database **`postgres`**, not host PostgreSQL 16.
- Shared `public` schema creates an isolation risk: an unrestricted database owner or global `public` DDL permissions would also expose AlilPost Ops. Restrict database migration role to the *specific AdmiralPost objects* and verify object dependencies/ownership first.
- The table names alone do **not** confirm which project owns every customer/quote object. Inspect read-only schema metadata and function/trigger dependencies before creating any grants or migration journal.

### Next read-only target-object inventory

```bash
sudo docker exec -u postgres supabase-db psql -X -w -U postgres -d postgres -P pager=off -c "
SELECT n.nspname AS schema_name,
       c.relname AS object_name,
       c.relkind AS kind,
       pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE (n.nspname = 'public' AND c.relname IN
         ('quote_requests','customer_profiles','customer_addresses'))
   OR (n.nspname = 'admiral_integrations')
ORDER BY n.nspname, c.relname;
" -c "
SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_get_userbyid(p.proowner) AS owner,
       pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid=p.pronamespace
WHERE n.nspname = 'admiral_integrations'
   OR (n.nspname = 'public' AND p.proname ILIKE '%quote%')
ORDER BY n.nspname,p.proname;
" -c "
SELECT event_object_schema, event_object_table, trigger_name
FROM information_schema.triggers
WHERE (event_object_schema='public' AND event_object_table IN
  ('quote_requests','customer_profiles','customer_addresses'))
  OR event_object_schema='admiral_integrations'
ORDER BY event_object_schema,event_object_table,trigger_name;
"
```

No customer rows, passwords, key material, role grants, NGINX configuration, or table contents are requested.

## Confirmed AdmiralPost object owners (administrator inventory, 2026-11-16)

The following relations exist in **Docker `supabase-db`, database `postgres`**, and are currently owned by database role `postgres`:

| Object | Owner |
| --- | --- |
| `public.quote_requests` | `postgres` |
| `public.customer_profiles` | `postgres` |
| `public.customer_addresses` | `postgres` |
| `admiral_integrations.ops_outbox` | `postgres` |

Do **not** use `postgres` / database superuser as the production migration runner, and do not grant a project-specific migrator membership in `postgres`. PostgreSQL DDL often requires ownership, not merely CRUD grants; plan a separate, explicitly reviewed migration-owner role strategy for AdmiralPost objects after inspecting functions, triggers, RLS and dependencies. Any `ops_*` migrations need the corresponding Ops-owned migration path rather than broad AdmiralPost permissions. Site deployment and new SQL migration deployment are still NOT integrated in Production.

Next read-only check should inventory routines and triggers, without exposing SQL bodies, customer data or secrets.
