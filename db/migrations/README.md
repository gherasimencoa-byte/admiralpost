# AdmiralPost PostgreSQL migrations

This directory is for **new, reviewed** AdmiralPost-only database changes targeting the PostgreSQL instance behind `https://supabase.alilpost.ge`.

## Deployment rule

Migrations must run automatically **after merging to main**, but only once the server-side migration runner and database credentials are configured, tested, and enabled. This directory alone is not a database deployment feature.

Expected final deploy order:

1. Validate source release and SQL files, verify hashes.
2. Take a verified PostgreSQL backup and keep the preceding website release.
3. Acquire a per-project deployment lock.
4. Read the migration journal and detect modified historical SQL.
5. Execute new SQL migrations in filename order, one transaction per migration.
6. Write the migration name, SHA-256, timestamp and release commit to the journal in the *same* transaction.
7. Deploy site files and run checks for both website and database.
8. Stop and alert on errors, preserving backups and the old website release.

## Naming

`YYYYMMDDHHMMSS_description.sql`, e.g. `20261116160000_add_pickup_window.sql`.

A migration is **append-only**: after execution, never edit, rename or remove it. Add a new migration to make a correction. The runner must refuse checksum mismatches.

## Important boundaries

- Only the **self-hosted PostgreSQL** associated with `supabase.alilpost.ge`.
- No cloud Supabase project, no database synchronization, no replay of the old `docs/backend/quote_requests_pickup_fields.sql`.
- Avoid changes to other AlilPost/Ops objects even if they share a PostgreSQL instance.
- PostgreSQL database roles must enforce the AdmiralPost object boundary. SQL validation alone cannot do that.
- Never commit DB passwords, secret keys, production dumps or customer data.
- Use additive/backward-compatible migrations first; do not automatically drop or rewrite critical data.
- Database changes already committed are not necessarily reversed when website files are rolled back. Data recovery is a separate tested procedure.

## First-time setup prerequisites

Before enabling automatic SQL deployment, an administrator must establish:

- Actual **database name**, ownership and schemas/tables/functions belonging to AdmiralPost.
- Whether `public.quote_requests` and `submit-quote` run on this PostgreSQL and who owns them.
- Restricted migration DB role and credentials stored **on the server only**.
- A secure, restore-tested backup destination and retention rules.
- A root-owned server-side migration runner integrated into the existing deployment lock and permission model.
- A successful dry run on a separate test database/clone.
- Production validation including a database read check and non-destructive form-endpoint health check.

Until then, **the existing website-only deployment must remain unchanged**, and database migration execution must remain disabled.
