#!/bin/bash

set -u

MANAGER_LABEL="${AMP_RUNNER_MANAGER_LABEL:-com.amp.runner-manager}"
CHECKS_BEFORE_RESTART="${AMP_RUNNER_MANAGER_FAILURE_THRESHOLD:-3}"
COOLDOWN_SECONDS="${AMP_RUNNER_MANAGER_RESTART_COOLDOWN:-1800}"
STALE_SECONDS="${AMP_RUNNER_MANAGER_LOG_STALE_AFTER:-900}"
VERIFY_ATTEMPTS="${AMP_RUNNER_MANAGER_VERIFY_ATTEMPTS:-12}"
VERIFY_INTERVAL="${AMP_RUNNER_MANAGER_VERIFY_INTERVAL:-5}"
STATE_DIR="${AMP_RUNNER_MANAGER_STATE_DIR:-$HOME/Library/Application Support/Amp Runner Manager/watchdog}"
STATE_FILE="$STATE_DIR/state"
AMP_LOG="${AMP_RUNNER_MANAGER_AMP_LOG:-$HOME/Library/Logs/amp-runner-manager.amp.log}"
LAUNCHCTL_BIN="${LAUNCHCTL_BIN:-/bin/launchctl}"
CURL_BIN="${CURL_BIN:-/usr/bin/curl}"
LSOF_BIN="${LSOF_BIN:-/usr/sbin/lsof}"
PS_BIN="${PS_BIN:-/bin/ps}"
STAT_BIN="${STAT_BIN:-/usr/bin/stat}"
SLEEP_BIN="${SLEEP_BIN:-/bin/sleep}"
DATE_BIN="${DATE_BIN:-/bin/date}"
ID_BIN="${ID_BIN:-/usr/bin/id}"

umask 077

log() {
  printf '%s %s\n' "$("$DATE_BIN" '+%Y-%m-%dT%H:%M:%S%z')" "$*"
}

is_uint() {
  case "$1" in
    '' | *[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

if ! is_uint "$CHECKS_BEFORE_RESTART" || [ "$CHECKS_BEFORE_RESTART" -lt 1 ]; then
  log "Invalid failure threshold: $CHECKS_BEFORE_RESTART"
  exit 2
fi
if ! is_uint "$COOLDOWN_SECONDS" || ! is_uint "$STALE_SECONDS" || \
  ! is_uint "$VERIFY_ATTEMPTS" || ! is_uint "$VERIFY_INTERVAL"; then
  log "Invalid watchdog timing configuration"
  exit 2
fi

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

failures=0
last_restart=0
if [ -f "$STATE_FILE" ]; then
  read -r stored_failures stored_restart < "$STATE_FILE" || true
  if is_uint "${stored_failures:-}"; then failures="$stored_failures"; fi
  if is_uint "${stored_restart:-}"; then last_restart="$stored_restart"; fi
fi

save_state() {
  temporary="$STATE_FILE.$$"
  printf '%s %s\n' "$1" "$2" > "$temporary"
  chmod 600 "$temporary"
  mv -f "$temporary" "$STATE_FILE"
}

uid="$("$ID_BIN" -u)"
target="gui/$uid/$MANAGER_LABEL"

service_output="$("$LAUNCHCTL_BIN" print "$target" 2>&1)"
service_status=$?
if [ "$service_status" -ne 0 ]; then
  log "Manager service is not loaded; watchdog will not recreate an intentionally unloaded service"
  save_state 0 "$last_restart"
  exit 0
fi

pid="$(printf '%s\n' "$service_output" | /usr/bin/awk '$1 == "pid" && $2 == "=" { print $3; exit }')"
if ! is_uint "$pid" || [ "$pid" -lt 1 ]; then
  log "Manager service is loaded without a PID; requesting launchd start"
  if "$LAUNCHCTL_BIN" kickstart "$target"; then
    save_state 0 "$last_restart"
    exit 0
  fi
  log "launchctl could not start the manager service"
  exit 1
fi

if [ ! -x "$CURL_BIN" ] || [ ! -x "$LSOF_BIN" ] || \
  [ ! -x "$PS_BIN" ] || [ ! -x "$STAT_BIN" ]; then
  log "Required health-check command is unavailable"
  exit 1
fi

manager_args="$("$PS_BIN" -p "$pid" -o args= 2>/dev/null || true)"
case "$manager_args" in
  *"--runner-id runner-manager"*"--remote-control-terminal"*) ;;
  *)
    log "Refusing to inspect or restart PID $pid because its manager role could not be verified"
    exit 1
    ;;
esac

has_connection() {
  "$LSOF_BIN" -nP -a -p "$1" -iTCP:443 -sTCP:ESTABLISHED 2>/dev/null | \
    /usr/bin/awk 'NR > 1 { found = 1 } END { exit !found }'
}

if has_connection "$pid"; then
  if [ "$failures" -gt 0 ]; then
    log "Manager connection recovered before restart"
  fi
  save_state 0 "$last_restart"
  exit 0
fi

if [ ! -f "$AMP_LOG" ]; then
  log "Detailed Amp log is not available yet; preserving the manager process"
  exit 0
fi

now="$("$DATE_BIN" '+%s')"
log_modified="$("$STAT_BIN" -f '%m' "$AMP_LOG" 2>/dev/null || true)"
if ! is_uint "$log_modified"; then
  log "Could not read detailed Amp log timestamp"
  exit 1
fi

log_age=$((now - log_modified))
if [ "$log_age" -lt "$STALE_SECONDS" ]; then
  if [ "$failures" -gt 0 ]; then
    log "Manager activity recovered before restart"
  fi
  save_state 0 "$last_restart"
  exit 0
fi

if ! "$CURL_BIN" --silent --show-error --fail --head --max-time 10 https://ampcode.com/ >/dev/null 2>&1; then
  log "Amp endpoint is unreachable; preserving the manager process"
  exit 0
fi

failures=$((failures + 1))
if [ "$failures" -lt "$CHECKS_BEFORE_RESTART" ]; then
  save_state "$failures" "$last_restart"
  log "Manager PID $pid has no established 443/TCP connection and no detailed activity for ${log_age}s ($failures/$CHECKS_BEFORE_RESTART)"
  exit 0
fi

if [ "$last_restart" -gt 0 ] && [ $((now - last_restart)) -lt "$COOLDOWN_SECONDS" ]; then
  save_state "$failures" "$last_restart"
  log "Manager remains inactive, but restart cooldown is active"
  exit 0
fi

log "Manager PID $pid stayed inactive while Amp was reachable; restarting it"
if ! "$LAUNCHCTL_BIN" kickstart -k "$target"; then
  log "launchctl failed to restart the manager service"
  save_state "$failures" "$last_restart"
  exit 1
fi
save_state 0 "$now"

attempt=0
while [ "$attempt" -lt "$VERIFY_ATTEMPTS" ]; do
  attempt=$((attempt + 1))
  "$SLEEP_BIN" "$VERIFY_INTERVAL"
  service_output="$("$LAUNCHCTL_BIN" print "$target" 2>&1)" || continue
  new_pid="$(printf '%s\n' "$service_output" | /usr/bin/awk '$1 == "pid" && $2 == "=" { print $3; exit }')"
  if is_uint "$new_pid" && [ "$new_pid" != "$pid" ] && has_connection "$new_pid"; then
    log "Manager recovered with PID $new_pid"
    exit 0
  fi
done

log "Manager restart completed, but connection recovery was not verified"
exit 1
