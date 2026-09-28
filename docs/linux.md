# Amp Runner Manager for Linux

[中文文档](linux.zh-CN.md) · [Back to README](../README.md)

Keeps one Amp [runner](https://ampcode.com/docs/cli/runners) running on a Linux machine as a systemd user service, so you can start threads on that machine from ampcode.com, your phone, or Puck without keeping `amp --no-tui` open in a terminal.

The service runs the same command as the Amp Mac app, `amp --no-tui --no-serve-cwd --runner-id <id>`, in your home folder, and adds `--remote-control-terminal` so the Terminal tab works in threads on this machine.

This guide does not use the `amp-runner-manager` plugin. The plugin is macOS-only; do not install it for Linux.

## Requirements

- Linux with systemd (Ubuntu, Debian, Fedora, Arch, and most other distributions)
- The Amp CLI installed and signed in with `amp login` as the user who will own the runner

The service runs as your normal user, not root. Threads can read and change everything that user can.

## Install

Run on the Linux machine, as your normal user (not with `sudo`):

```bash
git clone --depth 1 https://github.com/etonwan/amp-runner-manager.git
./amp-runner-manager/scripts/install-systemd.sh
```

The script:

1. Writes `~/.config/systemd/user/amp-runner.service`.
2. Enables and (re)starts it.
3. Enables linger for your user, so the runner starts at boot and keeps running after you log out. This may ask for your `sudo` password once.

The runner ID defaults to the machine's short hostname. To choose another one:

```bash
AMP_RUNNER_ID=my-devbox ./amp-runner-manager/scripts/install-systemd.sh
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
./amp-runner-manager/scripts/uninstall-systemd.sh
```

This stops the runner and removes the unit file. It keeps linger enabled, because other services of yours may rely on it; turn it off with `sudo loginctl disable-linger "$USER"`. It does not remove the Amp CLI or its logs.

## Troubleshooting

- **The service keeps restarting with `API key required for --no-tui`.** The service cannot see your sign-in. Run `amp login` as the same user, then `systemctl --user restart amp-runner`. Signing in only through an `AMP_API_KEY` variable in your shell does not reach the service.
- **`systemctl --user status` shows `active`, but the runner is missing from the picker.** systemd restarts the runner only when it exits, not when it stays running but disconnected. Run `systemctl --user restart amp-runner`.
- **`Failed to connect to bus` from `systemctl --user`.** You are in a shell without a user session, such as `sudo -u` or `su`. Log in as the user directly, or run `export XDG_RUNTIME_DIR=/run/user/$(id -u)` first.
- **The runner is gone after logout or reboot.** Linger is off. Run `sudo loginctl enable-linger "$USER"`.
- **A tool is missing in threads.** The service uses the `PATH` from when you ran the installer. Re-run the installer from a shell where the tool is on `PATH`.
