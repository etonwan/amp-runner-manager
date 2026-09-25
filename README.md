# Amp Runner Manager (Linux)

[中文文档](README.zh-CN.md)

Keeps one Amp [runner](https://ampcode.com/docs/cli/runners) running on a Linux machine as a systemd user service, so you can start threads on that machine from ampcode.com, your phone, or Puck without keeping `amp --no-tui` open in a terminal.

## Why this repository changed

This repository used to be a macOS-only Amp plugin. It ran a "management" runner that started and stopped a separate temporary runner for each registered Git project, plus a watchdog that restarted the management runner.

That design is no longer needed:

- **One runner can serve many folders.** `amp --no-tui` accepts `--dir`, `--discover-dirs`, and `--no-serve-cwd`, and `amp runner dirs add/remove` changes the served folders while the runner is running. You pick the folder when you start a thread. A runner per project is unnecessary.
- **The Amp Mac app is now the runner on macOS.** Since [The Mac App Is Your Runner](https://ampcode.com/news/the-mac-app-is-your-runner) (2026-09-24), the app runs `amp --no-tui --no-serve-cwd --runner-id <name>` in your home folder, serves only the folders you add, restarts the runner if it exits, and keeps the Mac awake. That replaces everything the plugin did on a Mac.
- **Runners update themselves.** A long-running runner installs new releases and restarts into them when idle.

Linux has no Amp app, so the only missing piece there is "start at boot and restart on crash". systemd already does that. This repository now does exactly what the Mac app does, using a systemd user service.

| Mac app                            | This repository on Linux                              |
| ---------------------------------- | ----------------------------------------------------- |
| Runs the runner in your home folder with `--no-serve-cwd` | Same command, in a systemd user service |
| Restarts the runner if it exits    | `Restart=always`                                      |
| Starts when you open the app       | Starts at boot (via systemd "linger")                 |
| Add folders in App Settings → Runner | `amp runner dirs add <path>`                        |
| Keep This Mac Awake                | Not handled; see [Sleep](#sleep)                      |

The runner also enables `--remote-control-terminal`, as the old plugin did, so the Terminal tab works in threads on this machine.

## Requirements

- Linux with systemd (Ubuntu, Debian, Fedora, Arch, and most other distributions)
- The Amp CLI installed and signed in with `amp login` as the user who will own the runner

The service runs as your normal user, not root. Threads can read and change everything that user can.

## Install

Run on the Linux machine, as your normal user (not with `sudo`):

```bash
git clone --depth 1 https://github.com/etonwan/amp-runner-manager.git
./amp-runner-manager/scripts/install.sh
```

The script:

1. Writes `~/.config/systemd/user/amp-runner.service`.
2. Enables and (re)starts it.
3. Enables linger for your user, so the runner starts at boot and keeps running after you log out. This may ask for your `sudo` password once.

The runner ID defaults to the machine's short hostname. To choose another one:

```bash
AMP_RUNNER_ID=my-devbox ./amp-runner-manager/scripts/install.sh
```

Runner IDs must be valid hostnames: letters, digits, and hyphens. Set `AMP_PATH` if `amp` is not on your `PATH`.

Re-run the script to change the runner ID or pick up a new `PATH`. The cloned folder is not needed after installation.

Check that the runner is up:

```bash
systemctl --user status amp-runner
amp runner list
```

## Choose which folders it serves

The runner starts with no folders. Add the folders you want threads to run in:

```bash
amp runner dirs add ~/code/storefront
amp runner dirs add ~/code/api
amp runner dirs list
amp runner dirs remove ~/code/api
```

Changes take effect immediately and survive restarts. Add `--runner-id <id>` if more than one runner is running on the machine. To let threads run anywhere in your home folder, add `~`.

Then start a thread on ampcode.com, pick this runner in the location picker, and pick a folder.

## Day-to-day operations

```bash
systemctl --user restart amp-runner   # restart
systemctl --user stop amp-runner      # stop until next boot or start
systemctl --user start amp-runner     # start again
journalctl --user -u amp-runner -f    # follow service output
```

Amp's detailed runner log is `~/.cache/amp/logs/amp-runner.log`.

Stopping the runner interrupts threads running on it. Do not stop it from the Terminal tab of a thread on this runner: that terminal runs inside the runner.

## Sleep

A runner only works while the machine is awake. Servers normally never sleep. On a laptop or desktop, disable automatic suspend in your desktop's power settings, or run:

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

Undo it with `sudo systemctl unmask` and the same targets.

## Uninstall

```bash
./amp-runner-manager/scripts/uninstall.sh
```

This stops the runner and removes the unit file. It keeps linger enabled, because other services of yours may rely on it; turn it off with `sudo loginctl disable-linger "$USER"`. It does not remove the Amp CLI or its logs.

### Migrating from the old macOS plugin

On a Mac, use the Amp app's Runner settings instead. To remove the old setup, follow the uninstall section of the [last macOS version of this README](https://github.com/etonwan/amp-runner-manager/blob/aa8d1fc/README.md#uninstall), including removing the `amp-runner-manager` Personal Plugin through Puck.

## Troubleshooting

- **The service keeps restarting with `API key required for --no-tui`.** The service cannot see your sign-in. Run `amp login` as the same user, then `systemctl --user restart amp-runner`. Signing in only through an `AMP_API_KEY` variable in your shell does not reach the service.
- **`Failed to connect to bus` from `systemctl --user`.** You are in a shell without a user session, such as `sudo -u` or `su`. Log in as the user directly, or run `export XDG_RUNTIME_DIR=/run/user/$(id -u)` first.
- **The runner is gone after logout or reboot.** Linger is off. Run `sudo loginctl enable-linger "$USER"`.
- **A tool is missing in threads.** The service uses the `PATH` from when you ran the installer. Re-run the installer from a shell where the tool is on `PATH`.
