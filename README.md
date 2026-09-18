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

## Stop and restart

Stopping a runner disconnects its remote terminal and interrupts work running through it. Finish or save that work first. Run the commands below in the Mac's local Terminal, signed in as the user who installed the runners, without `sudo`. Do not use the remote terminal of the runner being stopped.

### 1. Stop project runners

In a thread connected to the management runner, ask Amp:

> Stop the runner for storefront, then list project runners to confirm it is unloaded.

The project's status should show `loaded: false`. Stopping preserves the registration, repository, and logs. To restart it, ask Amp to start the runner for storefront again.

To stop all project runners before stopping or uninstalling the manager, ask:

> List project runners, stop every loaded project runner, then list them again to confirm all show loaded: false.

If the management runner is unavailable, find the project's stored `runnerId` in `~/Library/Application Support/Amp Runner Manager/config.json`. Use that ID, not the project name or alias, in the local Terminal:

```bash
RUNNER_ID="storefront" # Replace with the stored runnerId.
launchctl bootout "gui/$(id -u)/com.amp.runner-manager.$RUNNER_ID"
launchctl print "gui/$(id -u)/com.amp.runner-manager.$RUNNER_ID"
```

After a successful stop, `launchctl print` reports that it cannot find the service. Repeat for each project that needs to stop. Do not simply kill the process: `launchd` is configured to restart it while its job remains loaded.

To remove a registration as well, stop its runner first, then ask Amp to remove the storefront project. This removes the saved mapping, not the Git repository or logs.

### 2. Stop the management runner and watchdog

Stopping the manager does **not** stop project runners. Complete step 1 first if the goal is to stop all runners. Then unload the watchdog before the manager:

```bash
launchctl bootout "gui/$(id -u)/com.amp.runner-manager.watchdog"
launchctl bootout "gui/$(id -u)/com.amp.runner-manager"
```

Check that both jobs are unloaded:

```bash
launchctl print "gui/$(id -u)/com.amp.runner-manager.watchdog"
launchctl print "gui/$(id -u)/com.amp.runner-manager"
```

Both checks should report that the service cannot be found. If `bootout` reports an error, use these checks to distinguish an already unloaded job from a failed stop. If a job is still listed, wait briefly and check again; do not continue with uninstall until it is unloaded.

This is a temporary stop: configuration, logs, and LaunchAgent files remain. The manager and watchdog can load again at the next login, including after a Mac restart. To prevent that, follow the uninstall steps below.

To resume without reinstalling, after confirming both jobs are unloaded:

```bash
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.amp.runner-manager.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.amp.runner-manager.watchdog.plist"
```

Repeat the two `launchctl print` checks; both should now show loaded job details, and the manager should have `state = running` and a PID. Start any needed project runners separately through Amp.

## Uninstall

### 1. Stop all runners and remove automatic startup

Complete both steps in [Stop and restart](#stop-and-restart), including the checks that all project runners, the watchdog, and the management runner are unloaded. Then remove the two LaunchAgent files on the Mac so they cannot load at the next login:

```bash
rm -f \
  "$HOME/Library/LaunchAgents/com.amp.runner-manager.watchdog.plist" \
  "$HOME/Library/LaunchAgents/com.amp.runner-manager.plist"
```

### 2. Remove the Personal Plugin

Open Puck on [ampcode.com](https://ampcode.com) with `Ctrl+/` and send:

```prompt
Remove amp-runner-manager from my Personal Plugins. Ask before pushing the Personal Plugins repository, then reload the plugins.
```

Approve the push when asked. This removes the Personal Plugin across machines, not just on this Mac. It does not stop runners installed on other Macs; repeat the local stop and LaunchAgent removal steps there if needed. Reload plugins in other existing threads, or start new threads, to pick up the removal.

### 3. Optionally delete local data

The steps above preserve local configuration, helper scripts, watchdog state, and logs. Back up anything needed before running the following commands: they permanently delete registrations, settings, and logs, so a future installation will require registering projects again. They do not delete registered Git repositories or uninstall the Amp CLI.

```bash
rm -rf "$HOME/Library/Application Support/Amp Runner Manager"
rm -f \
  "$HOME/Library/Logs/amp-runner-manager.amp.log" \
  "$HOME/Library/Logs/amp-runner-manager.stdout.log" \
  "$HOME/Library/Logs/amp-runner-manager.stderr.log" \
  "$HOME/Library/Logs/amp-runner-manager-watchdog.log" \
  "$HOME/Library/Logs/amp-runner-manager-watchdog.stderr.log"
```

The installer also creates `~/runner-manager` as the manager's working directory. If it is no longer needed, remove it only when empty:

```bash
rmdir "$HOME/runner-manager"
```

If `rmdir` reports that the directory is not empty, leave it in place until its contents have been reviewed.

## Development

```bash
bun install
bun run check
```

Tests cover configuration validation, project resolution, runner ID generation, plist generation, and the `launchctl` command boundary. Real `launchd` integration must be verified on macOS.
