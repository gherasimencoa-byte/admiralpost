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
