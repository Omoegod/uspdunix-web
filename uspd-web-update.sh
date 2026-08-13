#!/bin/sh
# Manual install when tarball is already on device (e.g. copied via scp).
# Env: USPD_SUDO_PASSWORD — for /opt and systemctl (non-interactive)
#
# Usage: ./uspd-web-update.sh INSTALL_DIR TARBALL [BINARY] [SERVICE]
#
# Extract first, then restart — do not stop the service before install when
# this script is launched from uspd-web (systemctl stop kills the cgroup).
set -eu

INSTALL_DIR="${1:?install dir required}"
TARBALL="${2:?tarball path required}"
BINARY="${3:-uspd-web}"
SERVICE="${4:-uspd-web}"

LOG="/home/orangepi/uspd-web-update.log"
log() { printf '%s\n' "$*" >>"$LOG"; }

log "=== uspd-web update (manual) at $(date -Iseconds 2>/dev/null || date) ==="
log "install=${INSTALL_DIR} tarball=${TARBALL} user=$(id -un) uid=$(id -u)"

if [ ! -f "$TARBALL" ]; then
  log "ERROR: tarball not found: $TARBALL"
  exit 1
fi

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return $?
  fi
  if [ -z "${USPD_SUDO_PASSWORD:-}" ]; then
    log "ERROR: need root for: $* (set USPD_SUDO_PASSWORD)"
    return 1
  fi
  printf '%s\n' "$USPD_SUDO_PASSWORD" | sudo -S -p '' "$@"
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

log "Extracting to ${INSTALL_DIR}..."
run_install mkdir -p "$INSTALL_DIR"
run_install rm -f "${INSTALL_DIR}/${BINARY}"
run_install rm -rf "${INSTALL_DIR}/web"
run_install tar -xzf "$TARBALL" -C "$INSTALL_DIR"
run_install chmod +x "${INSTALL_DIR}/${BINARY}"

log "Installed files to ${INSTALL_DIR}"
rm -f "$TARBALL" 2>/dev/null || true

log "Restarting ${SERVICE}..."
restarted=0
if command -v systemctl >/dev/null 2>&1; then
  if as_root systemctl restart "$SERVICE" 2>/dev/null; then
    log "Restarted via systemctl ${SERVICE}"
    restarted=1
  elif as_root systemctl start "$SERVICE" 2>/dev/null; then
    log "Started via systemctl ${SERVICE}"
    restarted=1
  else
    log "WARN: systemd unit ${SERVICE} not available, using nohup"
  fi
fi

if [ "$restarted" -eq 0 ]; then
  pkill -x "$BINARY" 2>/dev/null || true
  sleep 1
  cd "$INSTALL_DIR"
  nohup "./${BINARY}" >> "${INSTALL_DIR}/uspd.log" 2>&1 &
  log "Started via nohup (pid $!)"
fi
log "=== update complete ==="
