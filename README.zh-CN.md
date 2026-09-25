# Amp Runner Manager（Linux 版）

[English](README.md)

本仓库把一个 Amp [Runner](https://ampcode.com/docs/cli/runners) 作为 systemd 用户服务常驻在 Linux 机器上。安装后，可以从 ampcode.com、手机或 Puck 在这台机器上创建 Thread，不需要在终端里一直开着 `amp --no-tui`。

## 为什么改成这样

本仓库原来是一个仅适用于 macOS 的 Amp 插件：一个常驻的「管理 Runner」按项目名启动和停止各项目专属的临时 Runner，另有一个 watchdog 负责重启管理 Runner。

这套设计已经没有必要：

- **一个 Runner 可以服务多个目录。** `amp --no-tui` 支持 `--dir`、`--discover-dirs` 和 `--no-serve-cwd`，运行中还可以用 `amp runner dirs add/remove` 增删目录。创建 Thread 时直接选目录，不再需要每个项目一个 Runner。
- **macOS 上 Amp App 本身就是 Runner。** 自 [The Mac App Is Your Runner](https://ampcode.com/news/the-mac-app-is-your-runner)（2026-09-24）起，App 会在用户主目录运行 `amp --no-tui --no-serve-cwd --runner-id <name>`，只服务手动添加的目录，进程意外退出时自动重启，并可阻止 Mac 休眠。原插件在 Mac 上的全部功能都被取代。
- **Runner 会自动更新。** 长期运行的 Runner 会自行安装新版本，并在空闲时重启到新版本。

Linux 没有 Amp App，缺的只有「开机自启、崩溃重启」，而这正是 systemd 的本职工作。因此本仓库现在用 systemd 用户服务在 Linux 上实现与 Mac App 相同的行为。

| Mac App                                  | 本仓库（Linux）                         |
| ---------------------------------------- | --------------------------------------- |
| 在主目录以 `--no-serve-cwd` 运行 Runner  | 同样的命令，由 systemd 用户服务运行     |
| Runner 退出后自动重启                    | `Restart=always`                        |
| 打开 App 时启动                          | 开机启动（通过 systemd 的 linger）      |
| 在 App Settings → Runner 中添加目录      | `amp runner dirs add <path>`            |
| Keep This Mac Awake                      | 不处理，见[休眠](#休眠)                 |

与原插件一样，Runner 会启用 `--remote-control-terminal`，因此这台机器上的 Thread 可以使用 Terminal 标签页。

## 环境要求

- 使用 systemd 的 Linux 发行版（Ubuntu、Debian、Fedora、Arch 等大多数发行版）
- 已安装 Amp CLI，并以将要运行 Runner 的用户执行过 `amp login`

服务以普通用户身份运行，不使用 root。Thread 可以读取和修改该用户能访问的所有文件。

## 安装

在 Linux 机器上以普通用户执行（不要加 `sudo`）：

```bash
git clone --depth 1 https://github.com/etonwan/amp-runner-manager.git
./amp-runner-manager/scripts/install.sh
```

脚本会：

1. 写入 `~/.config/systemd/user/amp-runner.service`。
2. 启用并（重新）启动该服务。
3. 为当前用户开启 linger，使 Runner 开机启动，并在用户注销后继续运行。这一步可能需要输入一次 `sudo` 密码。

Runner ID 默认使用机器的短主机名。如需指定：

```bash
AMP_RUNNER_ID=my-devbox ./amp-runner-manager/scripts/install.sh
```

Runner ID 必须是合法主机名，只能包含字母、数字和连字符。如果 `amp` 不在 `PATH` 中，请设置 `AMP_PATH`。

需要更换 Runner ID 或更新 `PATH` 时，重新运行脚本即可。安装完成后可以删除克隆下来的目录。

确认 Runner 已上线：

```bash
systemctl --user status amp-runner
amp runner list
```

## 选择要服务的目录

Runner 启动时不服务任何目录。添加需要运行 Thread 的目录：

```bash
amp runner dirs add ~/code/storefront
amp runner dirs add ~/code/api
amp runner dirs list
amp runner dirs remove ~/code/api
```

修改立即生效，Runner 重启后仍然保留。如果这台机器上运行着多个 Runner，请加上 `--runner-id <id>`。如需允许 Thread 在主目录任意位置运行，添加 `~`。

之后在 ampcode.com 创建 Thread，在位置选择器中选这个 Runner，再选择目录。

## 日常操作

```bash
systemctl --user restart amp-runner   # 重启
systemctl --user stop amp-runner      # 停止，直到下次开机或手动启动
systemctl --user start amp-runner     # 重新启动
journalctl --user -u amp-runner -f    # 实时查看服务输出
```

Amp 的详细 Runner 日志位于 `~/.cache/amp/logs/amp-runner.log`。

停止 Runner 会中断正在其上运行的 Thread。不要在该 Runner 上某个 Thread 的 Terminal 标签页里停止它，因为那个终端本身就运行在 Runner 中。

## 休眠

Runner 只在机器唤醒时工作。服务器通常不会休眠。笔记本或台式机请在桌面环境的电源设置中关闭自动挂起，或执行：

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

恢复时对相同的 target 执行 `sudo systemctl unmask`。

## 卸载

```bash
./amp-runner-manager/scripts/uninstall.sh
```

该脚本会停止 Runner 并删除 unit 文件。它不会关闭 linger，因为其他用户服务可能依赖它；如需关闭，执行 `sudo loginctl disable-linger "$USER"`。它也不会删除 Amp CLI 或日志。

### 从旧版 macOS 插件迁移

在 Mac 上请改用 Amp App 的 Runner 设置。移除旧部署时，请按照[最后一个 macOS 版本 README](https://github.com/etonwan/amp-runner-manager/blob/aa8d1fc/README.zh-CN.md) 中的卸载步骤操作，包括通过 Puck 移除名为 `amp-runner-manager` 的 Personal Plugin。

## 故障排查

- **服务反复重启，日志显示 `API key required for --no-tui`。** 服务读取不到登录状态。以同一用户执行 `amp login`，然后执行 `systemctl --user restart amp-runner`。仅在 shell 中设置 `AMP_API_KEY` 环境变量不会传递给服务。
- **`systemctl --user` 报 `Failed to connect to bus`。** 当前 shell 没有用户会话，例如通过 `sudo -u` 或 `su` 切换的用户。请直接以该用户登录，或先执行 `export XDG_RUNTIME_DIR=/run/user/$(id -u)`。
- **注销或重启后 Runner 消失。** linger 未开启。执行 `sudo loginctl enable-linger "$USER"`。
- **Thread 中找不到某个命令。** 服务使用的是运行安装脚本时的 `PATH`。请在该命令已加入 `PATH` 的 shell 中重新运行安装脚本。
