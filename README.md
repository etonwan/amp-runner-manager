# Amp Runner Manager

[中文文档](README.zh-CN.md)

Keeps Amp [runners](https://ampcode.com/docs/cli/runners) running on your own machines, so you can start threads on them from ampcode.com, your phone, or Puck. The repository has two independent versions:

- **macOS: a plugin for per-project runners.** A management runner starts and stops a separate runner for each registered Git project when you ask Amp by project name. See the [macOS guide](docs/macos.md).
- **Linux: one runner as a systemd service.** It behaves like the Amp Mac app's runner, for machines that cannot run the app. See the [Linux guide](docs/linux.md).

## Which one to use

**On a Mac, start with the Amp app's built-in runner.** Since [The Mac App Is Your Runner](https://ampcode.com/news/the-mac-app-is-your-runner) (2026-09-24), the app starts a runner for you, serves the folders you add, restarts the runner if it exits, and keeps the Mac awake. Turn it on in App Settings → Runner. Install this repository's plugin only if you need one of the advantages listed below.

**On Linux, use the systemd service.** There is no Amp app for Linux, and the service adds what a bare `amp --no-tui` lacks: starting at boot and restarting after a crash.

## Advantages over the official runner

### macOS plugin compared with the Amp app's runner

|                                               | Amp app's runner                                 | macOS plugin                                            |
| --------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| Setup                                         | One switch in App Settings                       | Personal Plugin plus an installer script                |
| Runners                                       | One runner serves every folder you add           | A management runner plus one runner per project         |
| Adding a project                              | App Settings or `amp runner dirs add` on the Mac | Ask Amp by project name or alias, from any device       |
| Allowed folders                               | Any folder you add                               | Only folders under allowed roots (default: home)        |
| A runner process exits                        | Restarted                                        | Restarted                                               |
| A runner process keeps running but is offline | Not handled in the documentation                 | Management runner is restarted by a watchdog            |
| One runner crashes                            | Every folder goes offline until it restarts      | Only that project goes offline                          |
| Terminal tab in threads                       | Not in the app's documented runner command       | Always on                                               |
| You quit the app                              | The runner stops                                 | Runners keep running                                    |
| Keeping the Mac awake                         | Yes, while plugged in                            | No                                                      |
| Resource use                                  | One `amp` process                                | One `amp` process per running project, plus the manager |
| Maintenance                                   | Amp                                              | You: about 2,000 lines of code and tests                |

Notes on the plugin's advantages:

- **Offline-but-running recovery.** In an incident in early September 2026, the management runner process stayed alive for about 15.5 hours after it stopped serving threads. A restart brought it back immediately. The app only restarts a runner that exits, so it would not have recovered. The cause was not confirmed, so it is unknown whether current Amp versions still do this. The watchdog covers only the management runner, not project runners.
- **Terminal tab.** The [app's runner documentation](https://ampcode.com/docs/macos-and-ios/runner) shows the command `amp --no-tui --no-serve-cwd --runner-id <name>` without `--remote-control-terminal` and describes no switch for it. This has not been checked on a Mac.
- **Remote management.** With the app, a thread running on the Mac can also run `amp runner dirs add` for you. The plugin's additions are name and alias lookup and the allowed-roots limit.

If none of these matter to you, the app's runner is simpler and needs no upkeep.

### Linux service compared with running `amp --no-tui` yourself

|                                                    | `amp --no-tui` in a terminal | Linux service                    |
| -------------------------------------------------- | ---------------------------- | -------------------------------- |
| Starts at boot                                     | No                           | Yes                              |
| Keeps running after logout or closing the terminal | No                           | Yes                              |
| The runner process exits                           | Stays down                   | Restarted within 10 seconds      |
| The runner process keeps running but is offline    | Not handled                  | Not handled; restart it manually |
| Terminal tab in threads                            | Only with the flag           | Always on                        |

The macOS watchdog has not been ported to Linux.

## Repository layout

| Path                                                                                                         | Version                                                           |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `index.ts`, `src/`, `skills/`, `test/`                                                                       | macOS plugin, installed as a Personal Plugin from this repository |
| `scripts/install-launch-agents.sh`, `scripts/runner-manager-watchdog.sh`, `scripts/runner-manager-doctor.sh` | macOS                                                             |
| `scripts/install-systemd.sh`, `scripts/uninstall-systemd.sh`                                                 | Linux                                                             |
