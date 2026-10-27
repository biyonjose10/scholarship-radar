# One-command start: installs dependencies if needed, loads ../.env, runs the dev server.
# Usage (from this folder): powershell -ExecutionPolicy Bypass -File .\start.ps1
# Add -Fixture to replay a labelled sample run (development only, no API calls).
param([switch]$Fixture)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $envFile)) {
  Write-Host "Missing $envFile - add NEBIUS_API_KEY and TAVILY_API_KEY there." -ForegroundColor Red
  exit 1
}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$' -and $Matches[2]) {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"', "'"), "Process")
  }
}
if ($Fixture) { $env:DEV_FIXTURE = "1"; Write-Host "Fixture mode: sample run, no API calls" -ForegroundColor Yellow }

if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules"))) { npm install }
Write-Host "Starting on http://localhost:3000" -ForegroundColor Green
npm run dev
