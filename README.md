# Amp Runner Manager

[中文文档](README.zh-CN.md)

Amp Runner Manager is a macOS-only Amp plugin that lets one persistent management runner start and stop temporary runners for registered Git projects.

The plugin provides these tools:

- `register_project`
- `remove_project`
- `start_project_runner`
- `stop_project_runner`
- `list_project_runners`

Both the management runner and every project runner enable Amp remote terminal access. Project runners use the registered repository as their working directory and receive a stable ID based on the folder name, such as `storefront`. Registering two projects whose folder names produce the same ID is rejected.

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

Run this on the Mac that will host the runners. The installer creates and loads the management Runner and its watchdog as user LaunchAgents. Re-running it upgrades an existing installation, preserves `AMP_RUNNER_MANAGER_ALLOWED_ROOTS`, and restarts the management Runner.

```bash
INSTALL_DIR="$(mktemp -d)"
git clone --depth 1 https://github.com/etonwan/amp-runner-manager.git "$INSTALL_DIR/amp-runner-manager"
"$INSTALL_DIR/amp-runner-manager/scripts/install-launch-agents.sh"
rm -rf "$INSTALL_DIR"
```

Verify that both jobs are loaded:

```bash
launchctl print "gui/$(id -u)/com.amp.runner-manager"
launchctl print "gui/$(id -u)/com.amp.runner-manager.watchdog"
```

The watchdog checks every five minutes. It restarts the management Runner only when Amp is reachable, the verified management process has no established 443/TCP connection, and its dedicated detailed log has shown no activity for at least 15 minutes on three consecutive checks. A 30-minute cooldown prevents restart loops. It does not recreate a deliberately unloaded management job.

### 3. Register and start a project runner

Ask Amp to register a repository once:

> Register project storefront at `/Users/alice/src/storefront` with aliases shop and web.

Then start it by name or alias:

> Start the runner for storefront.

The plugin always adds `--remote-control-terminal` when it creates a project runner. Project runner jobs are temporary: they are not installed in `~/Library/LaunchAgents` and do not return after a Mac restart.

Existing registrations keep their stored runner IDs. Stop, remove, and register a project again if it needs the folder-name-only format.

## Configuration

On first use, the plugin creates:

```text
~/Library/Application Support/Amp Runner Manager/
├── config.json
├── jobs/
└── logs/
```

By default, projects must be inside the current user's home directory. To use narrower or additional roots, set `AMP_RUNNER_MANAGER_ALLOWED_ROOTS` when running the installer before the first project is registered:

```bash
AMP_RUNNER_MANAGER_ALLOWED_ROOTS="/Users/alice/src:/Users/alice/work" \
  ./scripts/install-launch-agents.sh
```

The installer preserves this value on later runs when the variable is omitted. Exporting it without rerunning the installer does not change the environment of an already running management Runner.

If `config.json` already exists, stop the management runner before editing its `allowedRoots` array. Every registered path must be an existing absolute path to a Git repository root.

## Operations

Examples of requests to Amp:

- “List project runners.”
- “Start the runner for storefront.”
- “Stop the runner for shop.”
- “Remove the storefront project.”

Project runner logs are stored at:

```text
~/Library/Application Support/Amp Runner Manager/logs/<runner-id>.amp.log
~/Library/Application Support/Amp Runner Manager/logs/<runner-id>.stdout.log
~/Library/Application Support/Amp Runner Manager/logs/<runner-id>.stderr.log
```

The management Runner uses its own detailed log at `~/Library/Logs/amp-runner-manager.amp.log` instead of the shared Amp no-TUI log. Run local diagnostics with:

```bash
"$HOME/Library/Application Support/Amp Runner Manager/bin/runner-manager-doctor"
```

Watchdog decisions are recorded in `~/Library/Logs/amp-runner-manager-watchdog.log`.

Show recent errors with:

```bash
tail -n 100 "$HOME/Library/Application Support/Amp Runner Manager/logs/"*.stderr.log
```

## Uninstall

Stop all project runners first, then run:

```bash
launchctl bootout "gui/$(id -u)/com.amp.runner-manager.watchdog"
launchctl bootout "gui/$(id -u)/com.amp.runner-manager"
rm -f \
  "$HOME/Library/LaunchAgents/com.amp.runner-manager.watchdog.plist" \
  "$HOME/Library/LaunchAgents/com.amp.runner-manager.plist"
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
