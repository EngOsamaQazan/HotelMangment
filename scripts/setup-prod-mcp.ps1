# ============================================================
# Setup persistent MCP connection to PRODUCTION PostgreSQL.
#
# What this script does (run ONCE):
#   1. Copies your SSH public key to the server (one password prompt)
#   2. Fetches the production DB password from the server
#   3. Registers a persistent background SSH tunnel
#      (127.0.0.1:15432 -> server:5432)
#   4. Adds a "prod-postgres" entry in %USERPROFILE%\.cursor\mcp.json
#
# After it finishes: reload Cursor. MCP Postgres (prod) will be live.
# ============================================================

$ErrorActionPreference = "Stop"
$Server     = "31.220.82.115"
$SshUser    = "root"
$LocalPort  = 15432
$TaskName   = "HotelAppProdDbTunnel"

function Section($msg) {
    Write-Host ""
    Write-Host "===> $msg" -ForegroundColor Cyan
}

# ---- prerequisites ----
$pub = "$env:USERPROFILE\.ssh\id_ed25519.pub"
if (-not (Test-Path $pub)) {
    Write-Host "SSH public key not found at $pub" -ForegroundColor Red
    Write-Host "Run: ssh-keygen -t ed25519" -ForegroundColor Yellow
    exit 1
}

# ---- 1) Authorize local key on server ----
Section "1/4 Authorizing your SSH key on the server"
Write-Host "You will be prompted for the SERVER password ONE TIME only." -ForegroundColor Yellow
$pubKeyLine = (Get-Content $pub -Raw).Trim() -replace "'","'\''"
$remoteCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && (grep -qxF '$pubKeyLine' ~/.ssh/authorized_keys || echo '$pubKeyLine' >> ~/.ssh/authorized_keys) && echo KEY_OK"
ssh -o StrictHostKeyChecking=accept-new "$SshUser@$Server" $remoteCmd
if ($LASTEXITCODE -ne 0) { Write-Host "Failed to copy key" -ForegroundColor Red; exit 1 }

# ---- 2) Verify passwordless, fetch DB password ----
Section "2/4 Verifying passwordless SSH and fetching DB credentials"
$rawEnv = ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$SshUser@$Server" "cat /opt/hotel-app/.env"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rawEnv)) {
    Write-Host "Could not read /opt/hotel-app/.env from server (SSH key auth failed?)" -ForegroundColor Red
    exit 1
}
$dbLine = ($rawEnv -split "`n" | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1)
if (-not $dbLine) {
    Write-Host "DATABASE_URL not found in /opt/hotel-app/.env" -ForegroundColor Red
    exit 1
}
$dbUrl = ($dbLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
Write-Host "Fetched production DATABASE_URL ok" -ForegroundColor Green

# Rewrite the URL to go through our local tunnel (localhost:15432)
# Typical format: postgresql://user:pass@host:port/db?...
if ($dbUrl -notmatch '^postgresql://([^:]+):([^@]+)@([^:/]+):?(\d+)?/([^?]+)(\?.*)?$') {
    Write-Host "Unexpected DATABASE_URL format" -ForegroundColor Red
    exit 1
}
$dbUser = $Matches[1]
$dbPass = $Matches[2]
$dbName = $Matches[5]
$dbQry  = if ($Matches[6]) { $Matches[6] } else { "?schema=public" }
$tunneledUrl = "postgresql://${dbUser}:${dbPass}@127.0.0.1:${LocalPort}/${dbName}${dbQry}"

# ---- 3) Register persistent background tunnel (Scheduled Task at logon) ----
Section "3/4 Registering persistent SSH tunnel (auto-start at logon)"

# Kill any previous task
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$sshArgs  = "-o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -N -L ${LocalPort}:127.0.0.1:5432 ${SshUser}@${Server}"
# Wrap in a loop so the tunnel reconnects if dropped
$loopCmd = "while (`$true) { & ssh $sshArgs; Start-Sleep -Seconds 5 }"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -NoProfile -Command `"$loopCmd`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited | Out-Null

# Start it now
Start-ScheduledTask -TaskName $TaskName
Write-Host "Waiting for tunnel on 127.0.0.1:$LocalPort ..." -ForegroundColor Gray
$deadline = (Get-Date).AddSeconds(30)
$ok = $false
while ((Get-Date) -lt $deadline) {
    $t = Test-NetConnection -ComputerName 127.0.0.1 -Port $LocalPort -WarningAction SilentlyContinue
    if ($t.TcpTestSucceeded) { $ok = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ok) {
    Write-Host "Tunnel did not come up. Check scheduled task '$TaskName'" -ForegroundColor Red
    exit 1
}
Write-Host "Tunnel is UP on 127.0.0.1:$LocalPort" -ForegroundColor Green

# ---- 4) Register MCP Postgres in mcp.json ----
Section "4/4 Registering MCP Postgres (prod) in Cursor config"
$mcpPath = "$env:USERPROFILE\.cursor\mcp.json"
if (-not (Test-Path $mcpPath)) {
    New-Item -ItemType File -Path $mcpPath -Force | Out-Null
    '{ "mcpServers": {} }' | Set-Content -Path $mcpPath -Encoding UTF8
}
$json = Get-Content $mcpPath -Raw | ConvertFrom-Json
if (-not $json.mcpServers) {
    $json | Add-Member -NotePropertyName mcpServers -NotePropertyValue (New-Object psobject) -Force
}
$prodEntry = [pscustomobject]@{
    command = "npx"
    args    = @("-y", "@modelcontextprotocol/server-postgres", $tunneledUrl)
}
$json.mcpServers | Add-Member -NotePropertyName "prod-postgres" -NotePropertyValue $prodEntry -Force
($json | ConvertTo-Json -Depth 10) | Set-Content -Path $mcpPath -Encoding UTF8

Write-Host ""
Write-Host "===============================" -ForegroundColor Green
Write-Host " All done. Reload Cursor now." -ForegroundColor Green
Write-Host "===============================" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Host "  - SSH key authorized on $Server"
Write-Host "  - Persistent tunnel task: $TaskName (auto-start on logon)"
Write-Host "  - Tunnel endpoint: 127.0.0.1:$LocalPort -> $Server`:5432"
Write-Host "  - MCP entry 'prod-postgres' in $mcpPath"
Write-Host ""
Write-Host "DB: $dbUser@$dbName  (password stored inside mcp.json)" -ForegroundColor Gray
Write-Host ""
Write-Host "To stop the tunnel temporarily:  Stop-ScheduledTask -TaskName $TaskName"
Write-Host "To remove everything later:      Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
