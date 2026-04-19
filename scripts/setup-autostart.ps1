# Sets up the hotel-app to auto-start at user logon, fully hidden,
# using Windows Task Scheduler (native, no PM2 required).
#
# Also cleans up any previous PM2 Windows service attempt.
#
# Must run as Administrator.
# Usage (from elevated PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-autostart.ps1

$ErrorActionPreference = "Stop"

function Write-Step($n, $msg) { Write-Host ("[{0}] {1}" -f $n, $msg) -ForegroundColor Cyan }
function Write-Ok($msg)       { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn2($msg)    { Write-Host "    $msg" -ForegroundColor Yellow }
function Die($msg)            { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Die "This script must be run as Administrator."
}

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$VbsPath     = Join-Path $ProjectRoot "scripts\run-app-hidden.vbs"
$TaskName    = "HotelAppDev"
$CurrentUser = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Test-Path $VbsPath)) { Die "run-app-hidden.vbs not found at $VbsPath" }

Write-Host ""
Write-Host "=== Setting up hotel-app auto-start (no terminals) ===" -ForegroundColor Cyan
Write-Host ""

Write-Step 1 "Remove old PM2 Windows service (if any)"
$pm2Svc = Get-Service -Name "pm2.exe" -ErrorAction SilentlyContinue
if ($pm2Svc) {
    # Stop service (ignore failures)
    $ErrorActionPreference = "Continue"
    cmd /c "sc.exe stop pm2.exe >nul 2>&1"
    Start-Sleep -Seconds 2
    # Delete via sc.exe (reliable, no node warnings)
    cmd /c "sc.exe delete pm2.exe >nul 2>&1"
    Start-Sleep -Seconds 2
    $ErrorActionPreference = "Stop"
    $pm2SvcAfter = Get-Service -Name "pm2.exe" -ErrorAction SilentlyContinue
    if ($pm2SvcAfter) {
        Write-Warn2 "PM2 service still present (may need reboot). Proceeding anyway."
    } else {
        Write-Ok "PM2 service removed"
    }
} else {
    Write-Ok "No old PM2 service found"
}

Write-Step 2 "Kill any leftover pm2/node processes"
try {
    Get-Process node -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and ($_.Path -like '*pm2*' -or $_.CommandLine -like '*pm2*')
    } | Stop-Process -Force -ErrorAction SilentlyContinue
} catch { }
Write-Ok "Done"

Write-Step 3 "Locate node and wscript"
$NodeExe  = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$WScript  = Join-Path $env:WINDIR "System32\wscript.exe"
if (-not $NodeExe)     { Die "node.exe not found in PATH" }
if (-not (Test-Path $WScript)) { Die "wscript.exe not found" }
Write-Ok "node:    $NodeExe"
Write-Ok "wscript: $WScript"

Write-Step 4 "Remove existing task (if any)"
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Ok "Old task removed"
} else {
    Write-Ok "No existing task"
}

Write-Step 5 "Register scheduled task '$TaskName' at logon (hidden)"
$action    = New-ScheduledTaskAction -Execute $WScript -Argument ('"{0}"' -f $VbsPath)
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
$principal2 = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -Hidden

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal2 -Settings $settings `
    -Description "Hotel app Next.js dev server (auto-start, hidden)" | Out-Null
Write-Ok "Task '$TaskName' registered"

Write-Step 6 "Start the task now"
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 4
$state = (Get-ScheduledTask -TaskName $TaskName).State
Write-Ok "Task state: $state"

Write-Step 7 "Wait for dev server on http://127.0.0.1:3000"
$deadline = (Get-Date).AddMinutes(2)
$ready = $false
while ((Get-Date) -lt $deadline) {
    $t = Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -WarningAction SilentlyContinue
    if ($t.TcpTestSucceeded) { $ready = $true; break }
    Start-Sleep -Seconds 3
}
if ($ready) {
    Write-Ok "App is reachable on http://127.0.0.1:3000"
} else {
    Write-Warn2 "App not reachable yet. It may still be starting. Check:"
    Write-Warn2 "  Get-Content '$ProjectRoot\.pm2-logs\app.log' -Wait"
}

Write-Host ""
Write-Host "=== SUCCESS ===" -ForegroundColor Green
Write-Host ""
Write-Host "Auto-start configured via Task Scheduler (task: $TaskName)." -ForegroundColor White
Write-Host "The app will start at every user logon in a hidden window." -ForegroundColor White
Write-Host ""
Write-Host "Useful commands (any PowerShell, no need to keep open):" -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask   -TaskName $TaskName   # start now" -ForegroundColor Gray
Write-Host "  Stop-ScheduledTask    -TaskName $TaskName   # stop app" -ForegroundColor Gray
Write-Host "  Get-ScheduledTask     -TaskName $TaskName   # check state" -ForegroundColor Gray
Write-Host "  Get-Content '$ProjectRoot\.pm2-logs\app.log' -Wait  # tail logs" -ForegroundColor Gray
Write-Host ""
Write-Host "To stop manually: stop the task, then kill leftover 'node' processes." -ForegroundColor Gray
Write-Host "Open your browser: http://localhost:3000" -ForegroundColor Green
