#!/bin/sh
# Manual install when tarball is already on device (e.g. copied via scp).
# Env: USPD_SUDO_PASSWORD — for /opt and systemctl
#
# Usage: ./uspd-web-update.sh INSTALL_DIR TARBALL [BINARY] [SERVICE]
set -eu

INSTALL_DIR="${1:?install dir required}"
TARBALL="${2:?tarball path required}"
BINARY="${3:-uspd-web}"
SERVICE="${4:-uspd-web}"

LOG="/tmp/uspd-web-update.log"
exec >>"$LOG" 2>&1
echo "=== uspd-web update (manual) at $(date -Iseconds 2>/dev/null || date) ==="
echo "install=${INSTALL_DIR} tarball=${TARBALL} user=$(id -un)"

if [ ! -f "$TARBALL" ]; then
  echo "ERROR: tarball not found: $TARBALL"
  exit 1
fi

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return $?
  fi
  if [ -n "${USPD_SUDO_PASSWORD:-}" ]; then
    printf '%s\n' "$USPD_SUDO_PASSWORD" | sudo -S "$@"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return $?
  fi
  "$@"
}

need_root_for_install() {
  if [ "$(id -u)" -eq 0 ]; then return 1; fi
  if [ -d "$INSTALL_DIR" ] && [ -w "$INSTALL_DIR" ]; then return 1; fi
  parent=$(dirname "$INSTALL_DIR")
  if [ -d "$parent" ] && [ -w "$parent" ]; then return 1; fi
  return 0
}

run_install() {
  if need_root_for_install; then as_root "$@"; else "$@"; fi
}

sleep 2

if command -v systemctl >/dev/null 2>&1; then
  as_root systemctl stop "$SERVICE" 2>/dev/null || true
else
  pkill -f "${INSTALL_DIR}/${BINARY}" 2>/dev/null || true
  sleep 1
fi

run_install mkdir -p "$INSTALL_DIR"
run_install rm -f "${INSTALL_DIR}/${BINARY}"
run_install rm -rf "${INSTALL_DIR}/web"

if need_root_for_install; then
  as_root tar -xzf "$TARBALL" -C "$INSTALL_DIR"
else
  tar -xzf "$TARBALL" -C "$INSTALL_DIR"
fi

run_install chmod +x "${INSTALL_DIR}/${BINARY}"
rm -f "$TARBALL" 2>/dev/null || true

if command -v systemctl >/dev/null 2>&1; then
  if as_root systemctl start "$SERVICE" 2>/dev/null; then exit 0; fi
fi

cd "$INSTALL_DIR"
nohup "./${BINARY}" >> /tmp/uspd-web.log 2>&1 &
echo "Started via nohup (pid $!)"
