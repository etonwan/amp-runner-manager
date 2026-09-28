#!/bin/bash

set -u

label="com.amp.runner-manager"
uid="$(/usr/bin/id -u)"
target="gui/$uid/$label"
plist="$HOME/Library/LaunchAgents/$label.plist"

printf '%s\n' 'Amp Runner Manager diagnostics' '================================'
printf 'Time: '
/bin/date

printf '\nLaunchAgent:\n'
if [ -f "$plist" ]; then
  /usr/bin/plutil -lint "$plist"
else
  printf 'Missing: %s\n' "$plist"
fi

output="$(/bin/launchctl print "$target" 2>&1)"
status=$?
if [ "$status" -ne 0 ]; then
  printf 'Not loaded: %s\n' "$target"
  exit 1
fi
printf '%s\n' "$output" | /usr/bin/awk '
  $1 == "state" && $2 == "=" { print }
  $1 == "program" && $2 == "=" { print }
  $1 == "runs" && $2 == "=" { print }
  $1 == "pid" && $2 == "=" { print }
  $1 == "last" && $2 == "exit" { print }
'

pid="$(printf '%s\n' "$output" | /usr/bin/awk '$1 == "pid" && $2 == "=" { print $3; exit }')"
if [ -n "$pid" ]; then
  printf '\nProcess:\n'
  /bin/ps -p "$pid" -o pid=,ppid=,lstart=,etime=,state=,command=
  printf '\nEstablished 443/TCP connections: '
  /usr/sbin/lsof -nP -a -p "$pid" -iTCP:443 -sTCP:ESTABLISHED 2>/dev/null | /usr/bin/awk 'NR > 1 { count++ } END { print count + 0 }'
fi

printf '\nAmp endpoint: '
if /usr/bin/curl --silent --fail --head --max-time 10 https://ampcode.com/ >/dev/null; then
  printf 'reachable\n'
else
  printf 'unreachable\n'
fi

printf '\nRecent manager events:\n'
/usr/bin/tail -n 100 "$HOME/Library/Logs/amp-runner-manager.stdout.log" 2>/dev/null | \
  /usr/bin/grep -E 'AMP RUNNER|Registered|Reconnected|Connection interrupted|SIGTERM' | \
  /usr/bin/tail -n 20 || true

printf '\nLog files:\n'
for log_path in \
  "$HOME/Library/Logs/amp-runner-manager.amp.log" \
  "$HOME/Library/Logs/amp-runner-manager.stdout.log" \
  "$HOME/Library/Logs/amp-runner-manager.stderr.log" \
  "$HOME/Library/Logs/amp-runner-manager-watchdog.log"; do
  if [ -f "$log_path" ]; then
    /usr/bin/stat -f '%Sm %z bytes %N' -t '%Y-%m-%d %H:%M:%S%z' "$log_path"
  else
    printf 'Missing: %s\n' "$log_path"
  fi
done
