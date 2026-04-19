# SSH tunnel: localhost:15432 -> Postgres on server (127.0.0.1:5432 there).
# Keep this window open while using npm run dev. Ctrl+C to stop.

$ErrorActionPreference = "Stop"
$Server = "31.220.82.115"
$User = "root"
$LocalPort = 15432

Write-Host ""
Write-Host "Tunnel: 127.0.0.1:$LocalPort -> ${Server}:5432 (Postgres)" -ForegroundColor Cyan
Write-Host "Keep open. In another window: npm run dev" -ForegroundColor Gray
Write-Host ""

ssh -L "${LocalPort}:127.0.0.1:5432" "${User}@${Server}"
