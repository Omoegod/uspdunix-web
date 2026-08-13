#!/bin/sh
# Manual install when tarball is already on device (e.g. copied via scp).
# Web UI downloads via Go HTTP and calls the same steps automatically.
#
# Usage: ./uspd-web-update.sh INSTALL_DIR TARBALL [BINARY] [SERVICE]
# Example: ./uspd-web-update.sh /opt/uspd-web /tmp/uspd-web-1.0.0.tar.gz
set -eu

INSTALL_DIR="${1:?install dir required}"
TARBALL="${2:?tarball path required}"
BINARY="${3:-uspd-web}"
SERVICE="${4:-uspd-web}"

LOG="/tmp/uspd-web-update.log"
exec >>"$LOG" 2>&1
echo "=== uspd-web update at $(date -Iseconds 2>/dev/null || date) ==="
echo "install=${INSTALL_DIR} tarball=${TARBALL}"

if [ ! -f "$TARBALL" ]; then
  echo "ERROR: tarball not found: $TARBALL"
  exit 1
fi

sleep 2

if command -v systemctl >/dev/null 2>&1; then
  systemctl stop "$SERVICE" 2>/dev/null || true
else
  pkill -f "${INSTALL_DIR}/${BINARY}" 2>/dev/null || true
  sleep 1
fi

mkdir -p "$INSTALL_DIR"
rm -f "${INSTALL_DIR}/${BINARY}"
rm -rf "${INSTALL_DIR}/web"

tar -xzf "$TARBALL" -C "$INSTALL_DIR"
chmod +x "${INSTALL_DIR}/${BINARY}"

echo "Installed to ${INSTALL_DIR}"
rm -f "$TARBALL" 2>/dev/null || true

if command -v systemctl >/dev/null 2>&1; then
  if systemctl start "$SERVICE" 2>/dev/null; then
    echo "Started via systemctl ${SERVICE}"
    exit 0
  fi
fi

cd "$INSTALL_DIR"
nohup "./${BINARY}" >> /tmp/uspd-web.log 2>&1 &
echo "Started via nohup (pid $!)"
echo "=== update complete ==="
