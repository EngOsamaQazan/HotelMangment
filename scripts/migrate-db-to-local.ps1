# Migrates database from remote Postgres (via SSH tunnel) to local PostgreSQL.
# Must run as Administrator (resets postgres password and edits pg_hba.conf).
#
# Prerequisite: open an SSH tunnel in a separate window BEFORE running this:
#   ssh -L 15432:127.0.0.1:5432 root@31.220.82.115
#
# Usage (from an elevated PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\scripts\migrate-db-to-local.ps1

[CmdletBinding()]
param(
    [string]$PostgresPassword = "postgres",
    [string]$AppDbName        = "fakher_hotel",
    [string]$AppUser          = "fakher_user",
    [string]$AppPassword      = "FakherHotel2026Secure",
    [string]$RemoteDbUser     = "fakher_user",
    [string]$RemoteDbPassword = "FakherHotel2026Secure",
    [int]$LocalPgPort         = 5432,
    [int]$TunnelPort          = 15432,
    [string]$PgVersion        = "18"
)

$ErrorActionPreference = "Stop"

function Write-Step($n, $msg) { Write-Host ("[{0}] {1}" -f $n, $msg) -ForegroundColor Cyan }
function Write-Ok($msg)       { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn2($msg)    { Write-Host "    $msg" -ForegroundColor Yellow }
function Die($msg)            { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Die "This script must be run as Administrator. Right-click PowerShell > Run as Administrator."
}

$PgBin    = "C:\Program Files\PostgreSQL\$PgVersion\bin"
$DataDir  = "C:\Program Files\PostgreSQL\$PgVersion\data"
$PgHba    = Join-Path $DataDir "pg_hba.conf"
$PgHbaBak = Join-Path $DataDir "pg_hba.conf.migratebak"
$Service  = "postgresql-x64-$PgVersion"

if (-not (Test-Path "$PgBin\psql.exe")) { Die "psql.exe not found at $PgBin" }
if (-not (Test-Path $PgHba))            { Die "pg_hba.conf not found at $PgHba" }
if (-not (Get-Service -Name $Service -ErrorAction SilentlyContinue)) { Die "Service $Service not found" }

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvFile     = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $EnvFile)) { Die ".env not found at $EnvFile" }

$tunnel = Test-NetConnection -ComputerName 127.0.0.1 -Port $TunnelPort -WarningAction SilentlyContinue
if (-not $tunnel.TcpTestSucceeded) {
    Write-Host ""
    Write-Host "SSH tunnel on 127.0.0.1:$TunnelPort is NOT open." -ForegroundColor Red
    Write-Host "Open a new PowerShell window and run:" -ForegroundColor Yellow
    Write-Host "  ssh -L $TunnelPort`:127.0.0.1:5432 root@31.220.82.115" -ForegroundColor White
    Write-Host "Leave that window open, then run THIS script again." -ForegroundColor Yellow
    exit 1
}
Write-Ok "SSH tunnel detected on 127.0.0.1:$TunnelPort"

Write-Host ""
Write-Host "=== Migrating remote database to local PostgreSQL ===" -ForegroundColor Cyan
Write-Host ""

Write-Step 1 "Backup pg_hba.conf"
Copy-Item $PgHba $PgHbaBak -Force
Write-Ok "Backup saved: $PgHbaBak"

Write-Step 2 "Stop PostgreSQL service"
Stop-Service $Service -Force
Start-Sleep -Seconds 2
Write-Ok "Stopped"

Write-Step 3 "Temporarily switch local auth to trust"
$lines = Get-Content $PgHba
$newLines = foreach ($line in $lines) {
    if ($line -match '^\s*#') { $line }
    elseif ($line -match '^\s*(host|hostssl|hostnossl|local)\b') {
        $line -replace '\b(scram-sha-256|md5|password|peer|ident)\b', 'trust'
    }
    else { $line }
}
Set-Content $PgHba $newLines -Encoding ASCII
Write-Ok "pg_hba.conf patched"

Write-Step 4 "Start PostgreSQL"
Start-Service $Service
Start-Sleep -Seconds 3
Write-Ok "Running"

Write-Step 5 "Reset postgres superuser password"
$env:PGPASSWORD = ""
& "$PgBin\psql.exe" -U postgres -h 127.0.0.1 -p $LocalPgPort -d postgres -c "ALTER USER postgres WITH PASSWORD '$PostgresPassword';" | Out-Null
if ($LASTEXITCODE -ne 0) { Die "Failed to reset postgres password" }
Write-Ok "postgres password set to: $PostgresPassword"

Write-Step 6 "Create application database and user"
$sql = @"
DROP DATABASE IF EXISTS $AppDbName;
DROP USER IF EXISTS $AppUser;
CREATE USER $AppUser WITH PASSWORD '$AppPassword';
CREATE DATABASE $AppDbName OWNER $AppUser;
GRANT ALL PRIVILEGES ON DATABASE $AppDbName TO $AppUser;
"@
$sql | & "$PgBin\psql.exe" -U postgres -h 127.0.0.1 -p $LocalPgPort -d postgres -v ON_ERROR_STOP=1 | Out-Null
if ($LASTEXITCODE -ne 0) { Die "Failed to create app DB/user" }
Write-Ok "Database '$AppDbName' and user '$AppUser' created"

Write-Step 7 "Restore original pg_hba.conf"
Copy-Item $PgHbaBak $PgHba -Force
Remove-Item $PgHbaBak -Force
Write-Ok "pg_hba.conf restored"

Write-Step 8 "Restart PostgreSQL to re-apply auth"
Restart-Service $Service
Start-Sleep -Seconds 3
Write-Ok "Restarted"

Write-Step 9 "Dump remote database via SSH tunnel"
$dumpFile = Join-Path $env:TEMP "fakher_hotel_$(Get-Date -Format yyyyMMdd_HHmmss).dump"
$env:PGPASSWORD = $RemoteDbPassword
& "$PgBin\pg_dump.exe" -h 127.0.0.1 -p $TunnelPort -U $RemoteDbUser -d $AppDbName -F c -b -f $dumpFile
if ($LASTEXITCODE -ne 0) { Die "pg_dump failed. Is the tunnel still up? Is remote DB name '$AppDbName'?" }
$size = (Get-Item $dumpFile).Length
Write-Ok "Dumped to: $dumpFile ($([math]::Round($size/1MB,2)) MB)"

Write-Step 10 "Restore dump into local database"
$env:PGPASSWORD = $AppPassword
& "$PgBin\pg_restore.exe" -h 127.0.0.1 -p $LocalPgPort -U $AppUser -d $AppDbName --no-owner --no-privileges --clean --if-exists $dumpFile 2>&1 |
    Where-Object { $_ -notmatch 'already exists|does not exist|skipping' } | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
Write-Ok "Restore complete"

Write-Step 11 "Update .env to point to LOCAL database"
$encPass   = [Uri]::EscapeDataString($AppPassword)
$newDbUrl  = "postgresql://$AppUser`:$encPass@127.0.0.1:$LocalPgPort/$AppDbName`?schema=public"
$envLines  = Get-Content $EnvFile -Encoding UTF8
$updated   = foreach ($line in $envLines) {
    if ($line -match '^\s*DATABASE_URL=') { 'DATABASE_URL="' + $newDbUrl + '"' }
    else { $line }
}
Set-Content $EnvFile $updated -Encoding UTF8
Write-Ok "DATABASE_URL -> local"

Write-Step 12 "Run prisma generate"
Push-Location $ProjectRoot
& npx prisma generate
Pop-Location
if ($LASTEXITCODE -ne 0) { Write-Warn2 "prisma generate had issues (maybe files locked). Re-run later." }
else { Write-Ok "Prisma client generated" }

Write-Step 13 "Verify local connection"
Push-Location $ProjectRoot
& node "scripts/test-prisma-connection.cjs"
$verifyOk = $LASTEXITCODE -eq 0
Pop-Location

Remove-Item $dumpFile -Force -ErrorAction SilentlyContinue

Write-Host ""
if ($verifyOk) {
    Write-Host "=== SUCCESS ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Local PostgreSQL is ready. You can now:" -ForegroundColor White
    Write-Host "  * CLOSE the SSH tunnel window (no longer needed)." -ForegroundColor Green
    Write-Host "  * Run the app: npm run dev" -ForegroundColor White
    Write-Host ""
    Write-Host "Saved credentials:" -ForegroundColor Gray
    Write-Host "  postgres (superuser) password : $PostgresPassword" -ForegroundColor Gray
    Write-Host "  $AppUser password             : $AppPassword" -ForegroundColor Gray
    Write-Host "  Database                      : $AppDbName @ localhost:$LocalPgPort" -ForegroundColor Gray
} else {
    Write-Host "=== Migration done but verification failed ===" -ForegroundColor Yellow
    Write-Host "Check the error above; .env may still need a small tweak." -ForegroundColor Yellow
}
