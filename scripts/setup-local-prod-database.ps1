# Links local dev to production Postgres via SSH tunnel (local port 15432).
# Run: powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-prod-database.ps1
# Or double-click setup-prod-db.cmd

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

$Server = "31.220.82.115"
$SshUser = "root"
$LocalPort = 15432
$RemoteDbHost = "127.0.0.1"
$RemoteDbPort = 5432

Write-Host ""
Write-Host "=== Hotel app: local DB tunnel (SSH -> Postgres on server) ===" -ForegroundColor Cyan
Write-Host ""

$existing = Test-NetConnection -ComputerName 127.0.0.1 -Port $LocalPort -WarningAction SilentlyContinue
if ($existing.TcpTestSucceeded) {
    Write-Host "Port $LocalPort is already open -- skipping new SSH window." -ForegroundColor Green
}
else {
    Write-Host "A new window will open for SSH." -ForegroundColor Yellow
    Write-Host "When asked, enter the SERVER login password (root) -- NOT the database password." -ForegroundColor Yellow
    Write-Host "Keep that window open while you develop." -ForegroundColor Gray
    Write-Host ""
    Start-Sleep -Seconds 2

    $sshCmd = "ssh -o StrictHostKeyChecking=accept-new -L ${LocalPort}:${RemoteDbHost}:${RemoteDbPort} ${SshUser}@${Server}"
    Start-Process powershell -ArgumentList @("-NoExit", "-Command", $sshCmd)

    Write-Host "Waiting for tunnel on 127.0.0.1:${LocalPort} ..." -ForegroundColor Gray
    $deadline = (Get-Date).AddMinutes(4)
    $ok = $false
    while ((Get-Date) -lt $deadline) {
        $t = Test-NetConnection -ComputerName 127.0.0.1 -Port $LocalPort -WarningAction SilentlyContinue
        if ($t.TcpTestSucceeded) {
            $ok = $true
            break
        }
        Write-Host "  ... enter SSH password in the other window if prompted" -ForegroundColor DarkGray
        Start-Sleep -Seconds 2
    }

    if (-not $ok) {
        Write-Host ""
        Write-Host "Tunnel did not open in time. Check SSH password and server." -ForegroundColor Red
        exit 1
    }
    Write-Host "Tunnel is up." -ForegroundColor Green
}

Write-Host ""
Write-Host "Database password for user fakher_user:" -ForegroundColor Cyan
Write-Host "  On server run: grep ^DATABASE_URL= /opt/hotel-app/.env" -ForegroundColor DarkGray
Write-Host "  Copy the part between fakher_user: and @localhost" -ForegroundColor DarkGray
Write-Host ""
$plainPass = Read-Host "Paste DB password and press Enter"

if ([string]::IsNullOrWhiteSpace($plainPass)) {
    Write-Host "No password entered. Exit." -ForegroundColor Red
    exit 1
}

$encPass = [Uri]::EscapeDataString($plainPass)
$dbUrl = "postgresql://fakher_user:${encPass}@127.0.0.1:${LocalPort}/fakher_hotel?schema=public"

$envFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host ".env file not found." -ForegroundColor Red
    exit 1
}

$lines = Get-Content $envFile -Encoding UTF8
$newLines = foreach ($line in $lines) {
    if ($line -match '^\s*DATABASE_URL=') {
        'DATABASE_URL="' + $dbUrl + '"'
    }
    else {
        $line
    }
}
$newLines | Set-Content $envFile -Encoding UTF8

Write-Host ""
Write-Host "Updated DATABASE_URL in .env" -ForegroundColor Green

Write-Host ""
Write-Host "Running prisma generate ..." -ForegroundColor Gray
& npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "prisma generate failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Testing database connection ..." -ForegroundColor Gray
& node (Join-Path $ProjectRoot "scripts\test-prisma-connection.cjs")
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Connection failed. Check DB password and tunnel." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "In another terminal run: npm run dev" -ForegroundColor Cyan
Write-Host "Keep the SSH tunnel window open." -ForegroundColor Gray
Write-Host ""
