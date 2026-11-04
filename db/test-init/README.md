# Test Database Schema (private, not committed)

`schema.sql` is the **structure-only** (no rows) definition of the app database.
It describes the production table layout, so it is deliberately kept out of git
(`.gitignore`) and out of Docker images (`.dockerignore`). Only this README is committed.

pytest loads it into a throwaway MySQL (`docker-compose.test.yml`, port 3307,
data in RAM, bound to 127.0.0.1) at the start of every session.

## Local: generate / refresh

Needs `EsportsManagementTool/.env` pointing at the source DB (same as `dump-source-db`):

    docker compose --profile tools run --rm dump-test-schema

Re-run whenever the app's schema changes. Read-only against the source DB; exports no data.

## CI: publish it as a secret

CI restores the file from the `TEST_SCHEMA_B64` repository secret (gzip + base64,
which keeps it under GitHub's 48 KB secret limit). After regenerating locally:

    gzip -9c db/test-init/schema.sql | base64 | tr -d '\n' | gh secret set TEST_SCHEMA_B64

Also add it under Settings > Secrets > Dependabot, or Dependabot PRs will fail.
Fork PRs never receive secrets, so they cannot run the DB-backed tests.

## How it is used

1. `test_services` starts MySQL + Mailpit.
2. `test_database` drops/creates `esmt_test`, then runs `schema.sql` as root.
3. `app` points Flask at it (port 3307). Tests start with empty tables.
4. Use the `clean_db` fixture when a test needs guaranteed-empty tables.