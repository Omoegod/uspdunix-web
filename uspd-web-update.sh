#!/bin/sh
# uspd-web self-update: download release tarball, replace binary+web, restart.
# Args: VERSION INSTALL_DIR REPO [BINARY] [SERVICE]
set -eu

VERSION="${1:?version required}"
INSTALL_DIR="${2:?install dir required}"
REPO="${3:?repo required}"
BINARY="${4:-uspd-web}"
SERVICE="${5:-uspd-web}"

LOG="/tmp/uspd-web-update.log"
exec >>"$LOG" 2>&1
echo "=== uspd-web update to ${VERSION} at $(date -Iseconds 2>/dev/null || date) ==="

sleep 2

if command -v systemctl >/dev/null 2>&1; then
  systemctl stop "$SERVICE" 2>/dev/null || true
else
  pkill -f "${INSTALL_DIR}/${BINARY}" 2>/dev/null || true
  sleep 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

URL="https://github.com/${REPO}/releases/download/v${VERSION}/uspd-web-${VERSION}.tar.gz"
echo "Downloading ${URL}"

if command -v wget >/dev/null 2>&1; then
  wget -q "$URL" -O "$TMP/pkg.tar.gz"
elif command -v curl >/dev/null 2>&1; then
  curl -fsSL "$URL" -o "$TMP/pkg.tar.gz"
else
  echo "ERROR: wget or curl required"
  exit 1
fi

mkdir -p "$INSTALL_DIR"
rm -f "${INSTALL_DIR}/${BINARY}"
rm -rf "${INSTALL_DIR}/web"

tar -xzf "$TMP/pkg.tar.gz" -C "$INSTALL_DIR"
chmod +x "${INSTALL_DIR}/${BINARY}"

echo "Installed to ${INSTALL_DIR}"

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
