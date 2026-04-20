#!/usr/bin/env bash
# =============================================================================
# pgweb - Web-based PostgreSQL admin UI (single Go binary, no Docker)
# Target: hotel.aqssat.co server (Debian/Ubuntu)
# Run as: sudo bash deployment/pgweb/install.sh
# =============================================================================
#
# What it does:
#   1) Downloads the latest pgweb release from GitHub (auto-detects arch)
#   2) Installs binary to /usr/local/bin/pgweb
#   3) Creates dedicated 'pgweb' system user
#   4) Installs systemd service binding to 127.0.0.1:8081 (sessions mode)
#   5) Enables & starts the service
#
# Auth model:
#   - pgweb listens on localhost ONLY (Apache reverse-proxies with SSL)
#   - Apache enforces IP whitelist + HTTP Basic Auth
#   - User then enters Postgres credentials in pgweb's connection screen
#     (use cb_readonly for browse, cb_editor for data edits)
# =============================================================================

set -euo pipefail

PGWEB_USER="pgweb"
PGWEB_BIN="/usr/local/bin/pgweb"
PGWEB_PORT="8081"
PGWEB_BIND="127.0.0.1"

log() { echo -e "\033[1;32m[+]\033[0m $*"; }
err() { echo -e "\033[1;31m[!]\033[0m $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "Run this script as root (sudo)."
  exit 1
fi

# -----------------------------------------------------------------------------
# 1) Dependencies
# -----------------------------------------------------------------------------
log "Installing curl, unzip, apache2-utils..."
apt-get update -qq
apt-get install -y curl unzip ca-certificates apache2-utils jq

# -----------------------------------------------------------------------------
# 2) Detect architecture
# -----------------------------------------------------------------------------
ARCH_RAW="$(uname -m)"
case "${ARCH_RAW}" in
  x86_64|amd64)   PGWEB_ARCH="linux_amd64" ;;
  aarch64|arm64)  PGWEB_ARCH="linux_arm64" ;;
  armv7l)         PGWEB_ARCH="linux_arm64_v7" ;;
  armv5*|armv6*)  PGWEB_ARCH="linux_arm_v5" ;;
  *) err "Unsupported architecture: ${ARCH_RAW}"; exit 1 ;;
esac
log "Detected arch: ${ARCH_RAW} -> ${PGWEB_ARCH}"

# -----------------------------------------------------------------------------
# 3) Resolve latest release tag from GitHub API
# -----------------------------------------------------------------------------
log "Resolving latest pgweb release..."
LATEST_TAG="$(curl -fsSL https://api.github.com/repos/sosedoff/pgweb/releases/latest | jq -r '.tag_name')"
if [[ -z "${LATEST_TAG}" || "${LATEST_TAG}" == "null" ]]; then
  err "Could not resolve latest pgweb tag from GitHub."
  exit 1
fi
log "Latest pgweb release: ${LATEST_TAG}"

DOWNLOAD_URL="https://github.com/sosedoff/pgweb/releases/download/${LATEST_TAG}/pgweb_${PGWEB_ARCH}.zip"

# -----------------------------------------------------------------------------
# 4) Download & install binary
# -----------------------------------------------------------------------------
log "Downloading ${DOWNLOAD_URL}..."
TMP="$(mktemp -d)"
curl -fSL "${DOWNLOAD_URL}" -o "${TMP}/pgweb.zip"

log "Extracting..."
unzip -q -o "${TMP}/pgweb.zip" -d "${TMP}"

# Binary inside zip is named like pgweb_linux_amd64
EXTRACTED_BIN="$(find "${TMP}" -maxdepth 1 -type f -name 'pgweb_*' ! -name '*.zip' | head -n1)"
if [[ -z "${EXTRACTED_BIN}" ]]; then
  err "Could not find extracted pgweb binary."
  exit 1
fi

install -m 0755 "${EXTRACTED_BIN}" "${PGWEB_BIN}"
rm -rf "${TMP}"

INSTALLED_VER="$(${PGWEB_BIN} --version 2>&1 | head -n1)"
log "Installed: ${INSTALLED_VER}"

# -----------------------------------------------------------------------------
# 5) Create system user
# -----------------------------------------------------------------------------
if ! id -u "${PGWEB_USER}" >/dev/null 2>&1; then
  log "Creating system user '${PGWEB_USER}'..."
  useradd --system --no-create-home --shell /usr/sbin/nologin "${PGWEB_USER}"
fi

# -----------------------------------------------------------------------------
# 6) systemd service
# -----------------------------------------------------------------------------
log "Installing systemd service..."
cat > /etc/systemd/system/pgweb.service <<UNIT
[Unit]
Description=pgweb - Web-based PostgreSQL browser
Documentation=https://github.com/sosedoff/pgweb
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${PGWEB_USER}
Group=${PGWEB_USER}
ExecStart=${PGWEB_BIN} \\
    --bind=${PGWEB_BIND} \\
    --listen=${PGWEB_PORT} \\
    --sessions \\
    --no-pretty-json \\
    --cors-origin=https://db.hotel.aqssat.co
Restart=on-failure
RestartSec=5

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictRealtime=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable pgweb.service
systemctl restart pgweb.service

sleep 2
if systemctl is-active --quiet pgweb.service; then
  log "pgweb is running on http://${PGWEB_BIND}:${PGWEB_PORT}"
else
  err "pgweb failed to start. Check: journalctl -u pgweb -n 100"
  exit 1
fi

cat <<EOF

================================================================================
 pgweb installed successfully (native, no Docker)
================================================================================
 Binary       : ${PGWEB_BIN}
 Version      : ${INSTALLED_VER}
 Service      : pgweb.service  (systemctl status pgweb)
 Local URL    : http://${PGWEB_BIND}:${PGWEB_PORT}
 Logs         : journalctl -u pgweb -f

 NEXT STEPS:
   1) Configure Apache vhost (see deployment/pgweb/db.hotel.aqssat.co.conf)
   2) Issue Let's Encrypt cert for db.hotel.aqssat.co
   3) Open https://db.hotel.aqssat.co and connect to your database
================================================================================
EOF
