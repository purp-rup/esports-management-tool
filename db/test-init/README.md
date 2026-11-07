# Test Database Schema (private, not committed)

`schema.sql` is the **structure-only** (no rows) definition of the app database.
It describes the production table layout, so it is deliberately kept out of git
(`.gitignore`) and out of Docker images (`.dockerignore`).

`schema.sql.gz.enc` is gzipped and encrypted with the key `TEST_SCHEMA_KEY`.
The schema travels with each branch and CI decrypts it automatically.

Only this README is committed.

pytest loads the plaintext of `schema.sql` into a throwaway MySQL (`docker-compose.test.yml`, port 3307,
data in RAM, bound to 127.0.0.1) at the start of every session.

#### When the app's database schema changes (needs source DB access)
Needs `EsportsManagementTool/.env` pointing at the source DB and the real key in the root `.env`:
    
    powershell -ExecutionPolicy Bypass -File scripts\update-test-schema.ps1

This dumps the schema (read-only, no data), encrypts it, and verifies the round trip. Then, run:

    git add db/test-init/schema.sql.gz.enc

Finally, commit it with the code change that needs it. Each run produces different ciphertext so only
commit it when the schema actually changes. CI does not need a manual step.

## How it is Used

1. `test_services` starts MySQL + Mailpit.
2. `test_database` drops/creates `esmt_test`, then runs `schema.sql` as root.
3. `app` points Flask at it (port 3307). Tests start with empty tables.
4. Use the `clean_db` fixture when a test needs guaranteed-empty tables.

## Maintainers: Rotating the Key

Generate a new 32-byte random key, update the password manager and the GitHub
secret `TEST_SCHEMA_KEY` (Actions and Dependabot), run the update script, commit
the new `.enc`, and tell the team to update their `.env`. Old versions in git
history stay readable with the old key.