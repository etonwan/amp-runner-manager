# Amp Runner Manager

[English](README.md)

本仓库让 Amp [Runner](https://ampcode.com/docs/cli/runners) 常驻在自己的机器上，以便从 ampcode.com、手机或 Puck 在这些机器上创建 Thread。仓库包含两个相互独立的版本：

- **macOS：按项目管理 Runner 的插件。** 一个管理 Runner 按项目名启动和停止每个已注册 Git 项目专属的 Runner。参阅 [macOS 指南](docs/macos.zh-CN.md)。
- **Linux：作为 systemd 服务运行的单个 Runner。** 行为与 Amp Mac App 内置的 Runner 相同，适用于无法运行 App 的机器。参阅 [Linux 指南](docs/linux.zh-CN.md)。

## 如何选择

**在 Mac 上，优先使用 Amp App 内置的 Runner。** 自 [The Mac App Is Your Runner](https://ampcode.com/news/the-mac-app-is-your-runner)（2026-09-24）起，App 会自动启动 Runner，服务手动添加的目录，在 Runner 退出时重启它，并可阻止 Mac 休眠。在 App Settings → Runner 中开启即可。只有需要下文所列优势时，才安装本仓库的插件。

**在 Linux 上，使用 systemd 服务。** Linux 没有 Amp App。该服务补上了直接运行 `amp --no-tui` 所缺少的能力：开机启动和崩溃后重启。

## 相比官方 Runner 的优势

### macOS 插件与 Amp App 内置 Runner 对比

|                             | Amp App 内置 Runner                                 | macOS 插件                                       |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------ |
| 安装                        | 在 App Settings 中打开一个开关                      | 安装 Personal Plugin，并运行安装脚本             |
| Runner 数量                 | 一个 Runner 服务所有已添加的目录                    | 一个管理 Runner，外加每个项目一个 Runner         |
| 添加项目                    | 在 Mac 上通过 App Settings 或 `amp runner dirs add` | 在任意设备上按项目名或别名告诉 Amp               |
| 允许的目录                  | 任何手动添加的目录                                  | 仅限允许的根目录之下（默认为主目录）             |
| Runner 进程退出             | 自动重启                                            | 自动重启                                         |
| Runner 进程仍在但已离线     | 官方文档未提及处理方式                              | 看门狗会重启管理 Runner                          |
| 某个 Runner 崩溃            | 所有目录在重启前都不可用                            | 只影响该项目                                     |
| Thread 中的 Terminal 标签页 | App 文档中的 Runner 命令未启用                      | 始终启用                                         |
| 退出 App                    | Runner 停止                                         | Runner 继续运行                                  |
| 阻止 Mac 休眠               | 支持，仅在接通电源时                                | 不支持                                           |
| 资源占用                    | 一个 `amp` 进程                                     | 每个运行中的项目一个 `amp` 进程，外加管理 Runner |
| 维护方                      | Amp                                                 | 自行维护，约 2,000 行代码和测试                  |

插件优势的补充说明：

- **恢复「进程仍在但已离线」的 Runner。** 2026 年 9 月初的一次事故中，管理 Runner 进程在停止服务 Thread 后仍存活约 15.5 小时，重启后立即恢复。App 只在 Runner 退出时重启它，无法从这种状态中恢复。事故原因未能确认，因此不确定当前版本的 Amp 是否仍有此问题。看门狗只监控管理 Runner，不监控项目 Runner。
- **Terminal 标签页。** [App 的 Runner 文档](https://ampcode.com/docs/macos-and-ios/runner)中给出的命令是 `amp --no-tui --no-serve-cwd --runner-id <name>`，不含 `--remote-control-terminal`，也没有提到相应开关。此项未在 Mac 上实测。
- **远程管理。** 使用 App 时，也可以让运行在该 Mac 上的 Thread 替你执行 `amp runner dirs add`。插件额外提供的是按名称和别名查找，以及允许根目录的限制。

如果以上几点都不重要，App 内置 Runner 更简单，也无需维护。

### Linux 服务与直接运行 `amp --no-tui` 对比

|                             | 在终端中运行 `amp --no-tui` | Linux 服务           |
| --------------------------- | --------------------------- | -------------------- |
| 开机启动                    | 否                          | 是                   |
| 注销或关闭终端后继续运行    | 否                          | 是                   |
| Runner 进程退出             | 保持停止                    | 10 秒内自动重启      |
| Runner 进程仍在但已离线     | 不处理                      | 不处理，需要手动重启 |
| Thread 中的 Terminal 标签页 | 需要手动加参数              | 始终启用             |

macOS 版的看门狗尚未移植到 Linux。

## 仓库结构

| 路径                                                                                                         | 版本                                             |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `index.ts`、`src/`、`skills/`、`test/`                                                                       | macOS 插件，从本仓库根目录安装为 Personal Plugin |
| `scripts/install-launch-agents.sh`、`scripts/runner-manager-watchdog.sh`、`scripts/runner-manager-doctor.sh` | macOS                                            |
| `scripts/install-systemd.sh`、`scripts/uninstall-systemd.sh`                                                 | Linux                                            |
