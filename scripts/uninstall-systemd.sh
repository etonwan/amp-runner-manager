#!/usr/bin/env bash
# Stop the Amp runner service and remove its systemd unit.
# Leaves linger, Amp logs, and the Amp CLI in place.

set -euo pipefail

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

unit_name="amp-runner.service"
unit_path="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/$unit_name"

systemctl --user disable --now "$unit_name" 2>/dev/null || true
rm -f "$unit_path"
systemctl --user daemon-reload

echo "Amp runner service removed."
