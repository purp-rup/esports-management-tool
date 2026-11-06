# Re-dumps the source DB schema, encrypts it, and verifies the round trip.
# Run from anywhere: powershell -ExecutionPolicy Bypass -File scripts\update-test-schema.ps1
$ErrorActionPreference = "Stop"
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    docker compose --profile tools run --rm dump-test-schema
    if ($LASTEXITCODE -ne 0) { throw "Dump failed" }

    $before = (Get-FileHash db\test-init\schema.sql).Hash
    docker compose --profile tools run --rm decrypt-test-schema
    if ($LASTEXITCODE -ne 0) { throw "Decrypt failed" }
    $after = (Get-FileHash db\test-init\schema.sql).Hash
    if ($before -ne $after) { throw "Round trip mismatch: encrypted copy does not match schema.sql" }

    Write-Host "OK. Now run: git add db/test-init/schema.sql.gz.enc"
} finally {
    Pop-Location
}