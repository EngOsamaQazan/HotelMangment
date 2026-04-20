#!/usr/bin/env bash
# =============================================================================
# CloudBeaver Community Edition - Native install on Ubuntu (no Docker)
# Target: hotel.aqssat.co server
# Run as: sudo bash deployment/cloudbeaver/install.sh
# =============================================================================

set -euo pipefail

CB_VERSION="${CB_VERSION:-25.1.4}"
CB_USER="cloudbeaver"
CB_HOME="/opt/cloudbeaver"
CB_DATA="/var/lib/cloudbeaver"
CB_PORT="8978"
CB_BIND="127.0.0.1"
TARBALL_URL="https://dbeaver.io/files/cloudbeaver/${CB_VERSION}/cloudbeaver-ce-${CB_VERSION}-linux.x86_64.tar.gz"

log() { echo -e "\033[1;32m[+]\033[0m $*"; }
err() { echo -e "\033[1;31m[!]\033[0m $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "Run this script as root (sudo)."
  exit 1
fi

# -----------------------------------------------------------------------------
# 1) Install Java (17+) - CloudBeaver requirement
#    Picks the newest available headless JRE from the distro repos.
#    Tries 21 -> 17 -> default-jre (covers Debian 13, 12, Ubuntu 24/22/20).
# -----------------------------------------------------------------------------
log "Installing Java + curl + tar + apache2-utils..."
apt-get update -qq
apt-get install -y curl tar ca-certificates apache2-utils

JAVA_PKG=""
for pkg in openjdk-21-jre-headless openjdk-17-jre-headless default-jre-headless; do
  if apt-cache show "$pkg" >/dev/null 2>&1; then
    JAVA_PKG="$pkg"
    break
  fi
done

if [[ -z "$JAVA_PKG" ]]; then
  err "No suitable JRE package found in apt repositories."
  exit 1
fi

log "Selected Java package: $JAVA_PKG"
apt-get install -y "$JAVA_PKG"

JAVA_VER="$(java -version 2>&1 | head -n1 || true)"
log "Installed: $JAVA_VER"

# -----------------------------------------------------------------------------
# 2) Create dedicated system user
# -----------------------------------------------------------------------------
if ! id -u "${CB_USER}" >/dev/null 2>&1; then
  log "Creating system user '${CB_USER}'..."
  useradd --system --home "${CB_HOME}" --shell /usr/sbin/nologin "${CB_USER}"
fi

# -----------------------------------------------------------------------------
# 3) Download & extract CloudBeaver
# -----------------------------------------------------------------------------
if [[ ! -d "${CB_HOME}/server" ]]; then
  log "Downloading CloudBeaver ${CB_VERSION}..."
  TMP="$(mktemp -d)"
  curl -fSL "${TARBALL_URL}" -o "${TMP}/cb.tar.gz"

  log "Extracting to ${CB_HOME}..."
  mkdir -p "${CB_HOME}"
  tar -xzf "${TMP}/cb.tar.gz" -C "${TMP}"
  # Tarball extracts to ./cloudbeaver/ directory; move its contents
  cp -a "${TMP}/cloudbeaver/." "${CB_HOME}/"
  rm -rf "${TMP}"
else
  log "CloudBeaver already extracted at ${CB_HOME}, skipping download."
fi

# -----------------------------------------------------------------------------
# 4) Persistent data directory (workspace lives outside /opt for clean upgrades)
# -----------------------------------------------------------------------------
log "Preparing data directory ${CB_DATA}..."
mkdir -p "${CB_DATA}"
# CloudBeaver writes its workspace under ./workspace by default; symlink it.
if [[ ! -L "${CB_HOME}/workspace" ]]; then
  if [[ -d "${CB_HOME}/workspace" && ! -d "${CB_DATA}/workspace" ]]; then
    mv "${CB_HOME}/workspace" "${CB_DATA}/workspace"
  fi
  mkdir -p "${CB_DATA}/workspace"
  rm -rf "${CB_HOME}/workspace"
  ln -s "${CB_DATA}/workspace" "${CB_HOME}/workspace"
fi

chown -R "${CB_USER}:${CB_USER}" "${CB_HOME}" "${CB_DATA}"

# -----------------------------------------------------------------------------
# 5) Bind CloudBeaver to localhost only (Apache will reverse-proxy with SSL)
# -----------------------------------------------------------------------------
CONF="${CB_HOME}/conf/cloudbeaver.conf"
if [[ -f "${CONF}" ]]; then
  log "Configuring CloudBeaver to bind ${CB_BIND}:${CB_PORT}..."
  # serverPort
  if grep -q '"serverPort"' "${CONF}"; then
    sed -i -E "s/\"serverPort\"\s*:\s*[0-9]+/\"serverPort\": ${CB_PORT}/" "${CONF}"
  fi
  # serverHost (bind address)
  if grep -q '"serverHost"' "${CONF}"; then
    sed -i -E "s/\"serverHost\"\s*:\s*\"[^\"]*\"/\"serverHost\": \"${CB_BIND}\"/" "${CONF}"
  else
    sed -i "0,/\"serverPort\"/{s/\"serverPort\"/\"serverHost\": \"${CB_BIND}\",\n    \"serverPort\"/}" "${CONF}"
  fi
fi

# -----------------------------------------------------------------------------
# 6) systemd service
# -----------------------------------------------------------------------------
log "Installing systemd service..."
cat > /etc/systemd/system/cloudbeaver.service <<UNIT
[Unit]
Description=CloudBeaver Community Edition
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${CB_USER}
Group=${CB_USER}
WorkingDirectory=${CB_HOME}/server
ExecStart=${CB_HOME}/run-server.sh
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${CB_HOME} ${CB_DATA}

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable cloudbeaver.service
systemctl restart cloudbeaver.service

sleep 3
if systemctl is-active --quiet cloudbeaver.service; then
  log "CloudBeaver is running on http://${CB_BIND}:${CB_PORT}"
else
  err "CloudBeaver failed to start. Check: journalctl -u cloudbeaver -n 100"
  exit 1
fi

cat <<EOF

================================================================================
 CloudBeaver installed successfully (native, no Docker)
================================================================================
 Service        : cloudbeaver.service  (systemctl status cloudbeaver)
 Local URL      : http://${CB_BIND}:${CB_PORT}
 Install dir    : ${CB_HOME}
 Workspace      : ${CB_DATA}/workspace
 Logs           : journalctl -u cloudbeaver -f

 NEXT STEPS:
   1) Configure Apache vhost (see deployment/cloudbeaver/db.hotel.aqssat.co.conf)
   2) Issue Let's Encrypt cert for db.hotel.aqssat.co
   3) Open https://db.hotel.aqssat.co and finish first-run setup
================================================================================
EOF
