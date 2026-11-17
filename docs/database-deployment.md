# Automatic website and SQL updates

Pushes to main run tests and deploy through the existing Admiral installer. Every release first verifies the existing full server backup and website archive, then applies new migrations, reloads the API schema and publishes website files.

Put transactional SQL in migrations/YYYYMMDDHHMMSS_description.sql. Include all previous migrations unchanged. Each is applied once with a checksum in admiral_deploy.migrations. This uses the Ops migration engine and shared database/deployment locks. Ops keeps its existing separate ledger; never copy or replay its historical migrations here.

SQL is extracted only into private temporary storage, never into the public website. Root executes the installed trusted runner, not scripts from the release. SQL authors are trusted database administrators: this is not a SQL sandbox. Do not include secrets or personal data.

Use additive migrations compatible with the previous website and other sites sharing the database. A failed SQL transaction preserves the old site. A later website health failure rolls website files back but does NOT restore the shared database. Correct committed SQL with a new forward migration. Edge Function changes still use the Ops repository deployment.

The initial migration is SELECT 1 only; it verifies this path without altering business records. Tests use disposable local PostgreSQL and temporary filesystem paths.
