#!/usr/bin/env bash
# Install (or upgrade) a single always-on Amp runner as a systemd user service.
# Re-running the script rewrites the unit and restarts the runner.

set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "This installer requires Linux with systemd." >&2
  exit 1
fi
if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found; this installer requires systemd." >&2
  exit 1
fi

# systemctl --user needs this when the shell was not started by a login session (e.g. sudo -u, su).
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

amp_path="${AMP_PATH:-$(command -v amp || true)}"
if [ -z "$amp_path" ] || [ ! -x "$amp_path" ]; then
  echo "Could not find the Amp CLI. Install it, run 'amp login', or set AMP_PATH." >&2
  exit 1
fi

default_id="$(hostname -s | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9-]/-/g' -e 's/^-*//' -e 's/-*$//')"
runner_id="${AMP_RUNNER_ID:-${default_id:-linux}}"
if ! printf '%s' "$runner_id" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$'; then
  echo "Runner ID '$runner_id' is not a valid hostname label; set AMP_RUNNER_ID." >&2
  exit 1
fi

unit_name="amp-runner.service"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
unit_path="$unit_dir/$unit_name"
log_path="$HOME/.cache/amp/logs/amp-runner.log"

# systemd treats % as a specifier prefix.
escape() { printf '%s' "${1//%/%%}"; }

mkdir -p "$unit_dir" "$(dirname "$log_path")"
cat > "$unit_path" <<EOF
[Unit]
Description=Amp runner ($runner_id)
Documentation=https://ampcode.com/docs/cli/runners

[Service]
WorkingDirectory=%h
Environment="PATH=$(escape "$(dirname "$amp_path"):$PATH")"
ExecStart="$(escape "$amp_path")" --no-tui --no-serve-cwd --runner-id $runner_id --remote-control-terminal --log-file "$(escape "$log_path")"
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable "$unit_name" >/dev/null
systemctl --user restart "$unit_name"

# Linger keeps the user's services running without an open login session and starts them at boot.
if [ "$(loginctl show-user "$USER" --property=Linger --value 2>/dev/null)" != "yes" ]; then
  if ! loginctl enable-linger "$USER" 2>/dev/null && ! sudo loginctl enable-linger "$USER"; then
    echo "Warning: could not enable linger. The runner stops when you log out and does not start at boot." >&2
    echo "         Ask an administrator to run: sudo loginctl enable-linger $USER" >&2
  fi
fi

echo "Amp runner '$runner_id' installed as $unit_path"
echo "Add folders with: amp runner dirs add --runner-id $runner_id <path>"
