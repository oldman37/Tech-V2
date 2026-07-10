# Preflight validation gate for Tech-V2.
#
# Development runs fully in Docker (docker-compose.dev.yml); there are no host
# node_modules. The image builds are therefore the compile/validation gate:
#   - backend image:  shared tsc -> prisma generate -> backend tsc
#   - frontend image: frontend tsc -> vite build
#   - test run:       prisma migrate deploy -> npx vitest run (inside backend-test container)
#
# Requires: Docker Desktop running, .env present at repo root (compose interpolation).
# Exit code 0 = all checks passed.

$ErrorActionPreference = 'Stop'

# Ensure Docker CLI is on PATH (Docker Desktop installs here on Windows)
$dockerBin = 'C:\Program Files\Docker\Docker\resources\bin'
if (Test-Path $dockerBin) {
    $env:PATH = "$dockerBin;$env:PATH"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host '==> Preflight 1/3: backend image build (shared + prisma generate + backend tsc)'
docker compose -f docker-compose.dev.yml build backend
if ($LASTEXITCODE -ne 0) {
    Write-Host 'PREFLIGHT FAILED: backend image build returned a non-zero exit code.'
    exit 1
}

Write-Host '==> Preflight 2/3: frontend image build (tsc + vite build)'
docker compose -f docker-compose.dev.yml build frontend
if ($LASTEXITCODE -ne 0) {
    Write-Host 'PREFLIGHT FAILED: frontend image build returned a non-zero exit code.'
    exit 1
}

Write-Host '==> Preflight 3/3: backend integration tests (vitest run inside Docker)'
docker compose -f docker-compose.dev.yml --profile test run --build --rm backend-test
$testResult = $LASTEXITCODE

# Only remove the test-scoped db-test container. backend-test already cleans
# itself up via `run --rm` above. Deliberately scoped to just this one
# service (not `--profile test down`) — `down` also matches default-profile
# services with no `profiles:` key, which would stop/remove the persistent
# dev backend/frontend/db containers too.
Write-Host '==> Cleaning up test-only containers (db-test)'
docker compose -f docker-compose.dev.yml --profile test rm -f -s db-test

if ($testResult -ne 0) {
    Write-Host 'PREFLIGHT FAILED: backend integration tests returned a non-zero exit code.'
    exit 1
}

Write-Host 'All preflight checks passed.'
exit 0
