# One-command start: installs dependencies if needed, loads ../.env, runs the dev server.
# Usage (from this folder): powershell -ExecutionPolicy Bypass -File .\start.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $envFile)) {
  Write-Host "Missing $envFile - add NEBIUS_API_KEY and TAVILY_API_KEY there." -ForegroundColor Red
  exit 1
}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"', "'"), "Process")
  }
}

if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules"))) { npm install }
Write-Host "Starting on http://localhost:3000" -ForegroundColor Green
npm run dev
