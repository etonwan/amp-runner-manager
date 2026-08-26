# Amp Runner Manager

[中文文档](README.zh-CN.md)

Amp Runner Manager is a macOS-only Amp plugin that lets one persistent management runner start and stop temporary runners for registered Git projects.

The plugin provides these tools:

- `register_project`
- `remove_project`
- `start_project_runner`
- `stop_project_runner`
- `list_project_runners`

Both the management runner and every project runner enable Amp remote terminal access. Project runners use the registered repository as their working directory and receive a stable ID in the form `<folder>-amp-<hash>`, such as `storefront-amp-a1b2c3d4e5`.

## Requirements

- macOS
- Amp CLI installed and signed in
- A logged-in GUI user, because the plugin manages project runners in the user's `launchd` GUI domain

Bun is required only for development and tests. The plugin returns a `requires macOS` error on Linux and in Amp orbs.

## Deployment

Complete these steps before registering projects.

### 1. Install it as a Personal Plugin

Open Puck on [ampcode.com](https://ampcode.com) with `Ctrl+/`. In the Amp TUI, open the command palette with `Ctrl+O` and select `puck: open`. Then send:

```prompt
Install https://github.com/etonwan/amp-runner-manager as a Personal Plugin named amp-runner-manager. Ask before pushing the Personal Plugins repository, then reload the plugins.
```

Approve the push when Puck asks. The plugin is then available to the management runner without cloning it into the Mac's local plugin directory. Verify the installation on the Mac:

```bash
amp plugins list
amp skill info amp-runner-manager:managing-project-runners
```

### 2. Install the management runner

Run this command on the Mac that will host the runners. It first creates `~/runner-manager`, then creates and loads a user LaunchAgent that uses that directory as the management runner's working directory, uses the current Amp executable, and enables remote terminal access.

```bash
AMP_PATH="$(command -v amp)"
mkdir -p "$HOME/runner-manager" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$HOME/Library/LaunchAgents/com.amp.runner-manager.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.amp.runner-manager</string>
    <key>ProgramArguments</key>
    <array>
      <string>$AMP_PATH</string>
      <string>--no-tui</string>
      <string>--runner-id</string>
      <string>runner-manager</string>
      <string>--remote-control-terminal</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$HOME/runner-manager</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>$(dirname "$AMP_PATH"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
      <key>AMP_RUNNER_MANAGER_AMP_PATH</key>
      <string>$AMP_PATH</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/amp-runner-manager.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/amp-runner-manager.stderr.log</string>
  </dict>
</plist>
EOF

plutil -lint "$HOME/Library/LaunchAgents/com.amp.runner-manager.plist"
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.amp.runner-manager.plist"
```

Verify that the management runner is loaded:

```bash
launchctl print "gui/$(id -u)/com.amp.runner-manager"
```

### 3. Register and start a project runner

Ask Amp to register a repository once:

> Register project storefront at `/Users/alice/src/storefront` with aliases shop and web.

Then start it by name or alias:

> Start the runner for storefront.

The plugin always adds `--remote-control-terminal` when it creates a project runner. Project runner jobs are temporary: they are not installed in `~/Library/LaunchAgents` and do not return after a Mac restart.

Existing registrations keep their stored runner IDs. Stop, remove, and register a project again if it needs the new `<folder>-amp-<hash>` format.

## Configuration

On first use, the plugin creates:

```text
~/Library/Application Support/Amp Runner Manager/
├── config.json
├── jobs/
└── logs/
```

By default, projects must be inside the current user's home directory. To use narrower or additional roots, set `AMP_RUNNER_MANAGER_ALLOWED_ROOTS` before the first project is registered:

```bash
export AMP_RUNNER_MANAGER_ALLOWED_ROOTS="$HOME/src:$HOME/work"
```

If `config.json` already exists, stop the management runner before editing its `allowedRoots` array. Every registered path must be an existing absolute path to a Git repository root.

## Operations

Examples of requests to Amp:

- “List project runners.”
- “Start the runner for storefront.”
- “Stop the runner for shop.”
- “Remove the storefront project.”

Project runner logs are stored at:

```text
~/Library/Application Support/Amp Runner Manager/logs/<runner-id>.stdout.log
~/Library/Application Support/Amp Runner Manager/logs/<runner-id>.stderr.log
```

Show recent errors with:

```bash
tail -n 100 "$HOME/Library/Application Support/Amp Runner Manager/logs/"*.stderr.log
```

## Uninstall

Stop all project runners first, then run:

```bash
launchctl bootout "gui/$(id -u)/com.amp.runner-manager"
rm -f "$HOME/Library/LaunchAgents/com.amp.runner-manager.plist"
```

Open Puck and send:

```prompt
Remove amp-runner-manager from my Personal Plugins. Ask before pushing the Personal Plugins repository, then reload the plugins.
```

The local configuration and logs are preserved. Delete them only if they are no longer needed:

```bash
rm -rf "$HOME/Library/Application Support/Amp Runner Manager"
```

## Development

```bash
bun install
bun run check
```

Tests cover configuration validation, project resolution, runner ID generation, plist generation, and the `launchctl` command boundary. Real `launchd` integration must be verified on macOS.
