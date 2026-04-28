# نفق SSH إلى Postgres على سيرفر الإنتاج (127.0.0.1:5432 على السيرفر → منفذ محلي).
# اترك النافذة مفتوحة طوال عمل Cursor إذا كان MCP يستخدم نفس المنفذ.
#
# مثال:
#   .\scripts\ssh-tunnel-prod-db.ps1
#   .\scripts\ssh-tunnel-prod-db.ps1 -SshUser root
#
param(
    [string] $ServerHost = "31.220.82.115",
    [string] $SshUser = "root",
    [string] $IdentityFile = "C:\Users\PC\Desktop\Programing\SSHKeys\tayseer_prod_id_ed25519",
    [int] $LocalPort = 15432
)

if (-not (Test-Path -LiteralPath $IdentityFile)) {
    Write-Error "ملف المفتاح غير موجود: $IdentityFile — عدّل المعامل -IdentityFile."
    exit 1
}

Write-Host "نفق: localhost:$LocalPort -> ${ServerHost}:5432 (Postgres على السيرفر)"
Write-Host "المفتاح: $IdentityFile"
Write-Host "اضغط Ctrl+C لإيقاف النفق."
ssh -N -o ServerAliveInterval=60 -o ExitOnForwardFailure=yes `
    -i $IdentityFile -L "${LocalPort}:127.0.0.1:5432" "${SshUser}@${ServerHost}"
