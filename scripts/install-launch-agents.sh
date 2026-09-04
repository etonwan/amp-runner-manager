#!/bin/bash

set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  printf 'This installer requires macOS.\n' >&2
  exit 1
fi

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
manager_label="com.amp.runner-manager"
watchdog_label="com.amp.runner-manager.watchdog"
domain="gui/$(id -u)"
launch_agents="$HOME/Library/LaunchAgents"
logs="$HOME/Library/Logs"
state_root="$HOME/Library/Application Support/Amp Runner Manager"
bin_dir="$state_root/bin"
manager_plist="$launch_agents/$manager_label.plist"
watchdog_plist="$launch_agents/$watchdog_label.plist"
watchdog_path="$bin_dir/runner-manager-watchdog"
doctor_path="$bin_dir/runner-manager-doctor"
amp_path="${AMP_RUNNER_MANAGER_AMP_PATH:-$(command -v amp || true)}"

if [ -z "$amp_path" ] || [ ! -x "$amp_path" ]; then
  printf 'Could not find an executable Amp CLI.\n' >&2
  exit 1
fi

xml_escape() {
  printf '%s' "$1" | sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g' \
    -e 's/"/\&quot;/g' \
    -e "s/'/\\\&apos;/g"
}

mkdir -p "$HOME/runner-manager" "$launch_agents" "$logs" "$bin_dir"
chmod 700 "$state_root" "$bin_dir"
install -m 755 "$script_dir/runner-manager-watchdog.sh" "$watchdog_path"
install -m 755 "$script_dir/runner-manager-doctor.sh" "$doctor_path"

allowed_roots="${AMP_RUNNER_MANAGER_ALLOWED_ROOTS:-}"
if [ -z "$allowed_roots" ] && [ -f "$manager_plist" ]; then
  allowed_roots="$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:AMP_RUNNER_MANAGER_ALLOWED_ROOTS' "$manager_plist" 2>/dev/null || true)"
fi

amp_xml="$(xml_escape "$amp_path")"
amp_dir_xml="$(xml_escape "$(dirname "$amp_path")")"
home_xml="$(xml_escape "$HOME")"
watchdog_xml="$(xml_escape "$watchdog_path")"
allowed_roots_xml="$(xml_escape "$allowed_roots")"
manager_temporary="$(mktemp "$launch_agents/$manager_label.XXXXXX")"
watchdog_temporary="$(mktemp "$launch_agents/$watchdog_label.XXXXXX")"
manager_backup=""

cleanup() {
  rm -f "$manager_temporary" "$watchdog_temporary"
  if [ -n "$manager_backup" ]; then rm -f "$manager_backup"; fi
}
trap cleanup EXIT

cat > "$manager_temporary" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>$manager_label</string>
    <key>ProgramArguments</key>
    <array>
      <string>$amp_xml</string>
      <string>--log-file</string>
      <string>$home_xml/Library/Logs/amp-runner-manager.amp.log</string>
      <string>--no-tui</string>
      <string>--runner-id</string>
      <string>runner-manager</string>
      <string>--remote-control-terminal</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$home_xml/runner-manager</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>$amp_dir_xml:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
      <key>AMP_RUNNER_MANAGER_AMP_PATH</key>
      <string>$amp_xml</string>
EOF
if [ -n "$allowed_roots" ]; then
  cat >> "$manager_temporary" <<EOF
      <key>AMP_RUNNER_MANAGER_ALLOWED_ROOTS</key>
      <string>$allowed_roots_xml</string>
EOF
fi
cat >> "$manager_temporary" <<EOF
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>$home_xml/Library/Logs/amp-runner-manager.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$home_xml/Library/Logs/amp-runner-manager.stderr.log</string>
  </dict>
</plist>
EOF

cat > "$watchdog_temporary" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>$watchdog_label</string>
    <key>ProgramArguments</key>
    <array>
      <string>$watchdog_xml</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StartInterval</key>
    <integer>300</integer>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>$home_xml/Library/Logs/amp-runner-manager-watchdog.log</string>
    <key>StandardErrorPath</key>
    <string>$home_xml/Library/Logs/amp-runner-manager-watchdog.stderr.log</string>
  </dict>
</plist>
EOF

plutil -lint "$manager_temporary"
plutil -lint "$watchdog_temporary"

if [ -f "$manager_plist" ]; then
  manager_backup="$(mktemp "$launch_agents/$manager_label.backup.XXXXXX")"
  cp "$manager_plist" "$manager_backup"
fi

launchctl bootout "$domain/$watchdog_label" >/dev/null 2>&1 || true
launchctl bootout "$domain/$manager_label" >/dev/null 2>&1 || true
install -m 644 "$manager_temporary" "$manager_plist"
install -m 644 "$watchdog_temporary" "$watchdog_plist"

if ! launchctl bootstrap "$domain" "$manager_plist"; then
  if [ -n "$manager_backup" ]; then
    printf 'New manager job failed; restoring the previous plist.\n' >&2
    install -m 644 "$manager_backup" "$manager_plist"
    launchctl bootstrap "$domain" "$manager_plist" || true
  fi
  exit 1
fi
launchctl bootstrap "$domain" "$watchdog_plist"

printf '\nInstalled and started:\n'
printf '  %s\n  %s\n' "$manager_label" "$watchdog_label"
printf '\nRun diagnostics with:\n  %q\n' "$doctor_path"
