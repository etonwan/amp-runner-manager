# Amp Runner Manager

[English](README.md)

Amp Runner Manager 是一个仅适用于 macOS 的 Amp 插件。它使用一个常驻的管理 Runner，按项目名启动和停止临时的项目 Runner。

插件提供以下工具：

- `register_project`
- `remove_project`
- `start_project_runner`
- `stop_project_runner`
- `list_project_runners`

管理 Runner 和所有项目 Runner 都会启用 Amp 远程 Terminal。项目 Runner 以已注册的 Git 仓库作为工作目录，并使用基于文件夹名的稳定 ID，例如 `storefront`。如果两个项目的文件夹名生成了相同 ID，后注册的项目会被拒绝。

## 环境要求

- macOS
- 已安装并登录 Amp CLI
- 当前用户已登录图形界面，因为插件需要访问该用户的 `launchd` GUI 域

Bun 只用于开发和测试。在 Linux 或 Amp Orb 中调用插件时，插件会返回 `requires macOS` 错误。

## 部署

请在注册项目之前完成以下步骤。

### 1. 安装为 Personal Plugin

在 [ampcode.com](https://ampcode.com) 按 `Ctrl+/` 打开 Puck。在 Amp TUI 中，按 `Ctrl+O` 打开命令面板，然后选择 `puck: open`。随后发送：

```prompt
Install https://github.com/etonwan/amp-runner-manager as a Personal Plugin named amp-runner-manager. Ask before pushing the Personal Plugins repository, then reload the plugins.
```

Puck 请求授权时，批准推送。插件随后可供管理 Runner 使用，不需要克隆到 Mac 的本地插件目录。在 Mac 上检查安装结果：

```bash
amp plugins list
amp skill info amp-runner-manager:managing-project-runners
```

### 2. 安装管理 Runner

在用于运行 Runner 的 Mac 上执行以下命令。安装程序会把管理 Runner 和 watchdog 安装为用户 LaunchAgent 并加载。重复运行可以升级现有安装；安装程序会保留 `AMP_RUNNER_MANAGER_ALLOWED_ROOTS`，并重启管理 Runner。

```bash
INSTALL_DIR="$(mktemp -d)"
git clone --depth 1 https://github.com/etonwan/amp-runner-manager.git "$INSTALL_DIR/amp-runner-manager"
"$INSTALL_DIR/amp-runner-manager/scripts/install-launch-agents.sh"
rm -rf "$INSTALL_DIR"
```

检查两个任务是否均已加载：

```bash
launchctl print "gui/$(id -u)/com.amp.runner-manager"
launchctl print "gui/$(id -u)/com.amp.runner-manager.watchdog"
```

watchdog 每 5 分钟检查一次。只有 Amp 网站可访问、确认目标进程确实是管理 Runner、该进程没有已建立的 443/TCP 连接，并且独立详细日志已超过 15 分钟没有活动，连续 3 次检查均如此时，watchdog 才会重启管理 Runner。重启后有 30 分钟冷却时间，以免反复重启。watchdog 不会重新创建被人为卸载的管理任务。

### 3. 注册并启动项目 Runner

首次使用项目时，让 Amp 注册 Git 仓库：

> 注册项目 storefront，路径是 `/Users/alice/src/storefront`，别名是 shop 和 web。

之后通过项目名或别名启动：

> 启动 storefront 的 Runner。

插件创建项目 Runner 时始终添加 `--remote-control-terminal`。项目 Runner 是临时任务，不会安装到 `~/Library/LaunchAgents`，Mac 重启后也不会自动恢复。

已注册项目会保留原 Runner ID。如需改用仅包含文件夹名的新格式，请先停止并移除项目，然后重新注册。

## 配置

首次使用时，插件会创建：

```text
~/Library/Application Support/Amp Runner Manager/
├── config.json
├── jobs/
└── logs/
```

默认情况下，项目必须位于当前用户的主目录中。如果需要限制或增加允许的根目录，请在首次注册项目前，通过 `AMP_RUNNER_MANAGER_ALLOWED_ROOTS` 运行安装程序：

```bash
AMP_RUNNER_MANAGER_ALLOWED_ROOTS="/Users/alice/src:/Users/alice/work" \
  ./scripts/install-launch-agents.sh
```

以后不设置该变量再次运行安装程序时，安装程序会保留原值。只在终端中设置变量而不重新运行安装程序，不会改变已运行管理 Runner 的环境。

如果 `config.json` 已存在，请先停止管理 Runner，再编辑其中的 `allowedRoots` 数组。每个项目路径都必须是已存在的绝对路径，并指向 Git 仓库根目录。

## 常用操作

可以向 Amp 发出以下请求：

- 「列出项目 Runner。」
- 「启动 storefront 的 Runner。」
- 「停止 shop 的 Runner。」
- 「移除 storefront 项目。」

项目 Runner 的日志位于：

```text
~/Library/Application Support/Amp Runner Manager/logs/<runner-id>.amp.log
~/Library/Application Support/Amp Runner Manager/logs/<runner-id>.stdout.log
~/Library/Application Support/Amp Runner Manager/logs/<runner-id>.stderr.log
```

管理 Runner 使用独立的详细日志 `~/Library/Logs/amp-runner-manager.amp.log`，不再与其他无 TUI Runner 共用日志。运行以下命令可以执行本地诊断：

```bash
"$HOME/Library/Application Support/Amp Runner Manager/bin/runner-manager-doctor"
```

watchdog 的判断记录在 `~/Library/Logs/amp-runner-manager-watchdog.log`。

查看最近的错误：

```bash
tail -n 100 "$HOME/Library/Application Support/Amp Runner Manager/logs/"*.stderr.log
```

## 停止与恢复

停止 Runner 会断开其远程 Terminal，并中断通过该 Runner 执行的工作。操作前，请先完成或保存这些工作。以下命令需要在 Mac 的本地终端中执行，使用安装 Runner 的用户账号，不要添加 `sudo`，也不要在即将停止的 Runner 的远程 Terminal 中执行。

### 1. 停止项目 Runner

在连接到管理 Runner 的线程中向 Amp 发送：

> 停止 storefront 的 Runner，然后列出项目 Runner，确认它已卸载。

项目状态应显示 `loaded: false`。停止后，注册信息、Git 仓库和日志都会保留。需要恢复时，再让 Amp 启动 storefront 的 Runner 即可。

停止或卸载管理 Runner 前，如需先停止所有项目 Runner，可以发送：

> 列出项目 Runner，逐一停止所有已加载的项目 Runner，然后再次列出，确认全部显示 loaded: false。

如果管理 Runner 无法连接，请在 `~/Library/Application Support/Amp Runner Manager/config.json` 中查找项目保存的 `runnerId`，然后在本地终端执行以下命令。必须使用保存的 ID，而不是项目名或别名：

```bash
RUNNER_ID="storefront" # 替换为保存的 runnerId。
launchctl bootout "gui/$(id -u)/com.amp.runner-manager.$RUNNER_ID"
launchctl print "gui/$(id -u)/com.amp.runner-manager.$RUNNER_ID"
```

停止成功后，`launchctl print` 应提示找不到该服务。对每个需要停止的项目重复操作。不要只结束进程：只要任务仍处于加载状态，`launchd` 就会自动重启进程。

如果还需要移除注册信息，请先停止项目 Runner，再让 Amp 移除 storefront 项目。移除操作只删除保存的项目映射，不删除 Git 仓库或日志。

### 2. 停止管理 Runner 和 watchdog

停止管理 Runner **不会**停止项目 Runner。如果需要停止所有 Runner，请先完成第 1 步。然后先卸载 watchdog 任务，再卸载管理 Runner 任务：

```bash
launchctl bootout "gui/$(id -u)/com.amp.runner-manager.watchdog"
launchctl bootout "gui/$(id -u)/com.amp.runner-manager"
```

检查两个任务是否均已卸载：

```bash
launchctl print "gui/$(id -u)/com.amp.runner-manager.watchdog"
launchctl print "gui/$(id -u)/com.amp.runner-manager"
```

两条检查命令都应提示找不到对应服务。如果 `bootout` 报错，请通过上述检查确认任务是已经卸载，还是停止失败。如果仍能看到任务信息，请稍等后再次检查；确认任务已卸载后，才能继续卸载流程。

这是临时停止：配置、日志和 LaunchAgent 文件都会保留。下次登录 Mac 时，包括重启后登录，管理 Runner 和 watchdog 仍可能自动加载。如果需要阻止自动启动，请执行下方的卸载步骤。

如需恢复运行，无须重新安装。确认两个任务均已卸载后，执行：

```bash
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.amp.runner-manager.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.amp.runner-manager.watchdog.plist"
```

再次执行上面的两条 `launchctl print` 检查命令。两个任务都应显示已加载的任务信息，管理 Runner 应显示 `state = running` 和 PID（进程 ID）。需要使用的项目 Runner 仍需通过 Amp 单独启动。

## 卸载

### 1. 停止所有 Runner 并移除自动启动配置

先完成[停止与恢复](#停止与恢复)中的两个停止步骤，并确认所有项目 Runner、watchdog 和管理 Runner 均已卸载。然后在 Mac 上删除两个 LaunchAgent 文件，防止下次登录时自动加载：

```bash
rm -f \
  "$HOME/Library/LaunchAgents/com.amp.runner-manager.watchdog.plist" \
  "$HOME/Library/LaunchAgents/com.amp.runner-manager.plist"
```

### 2. 移除 Personal Plugin

在 [ampcode.com](https://ampcode.com) 按 `Ctrl+/` 打开 Puck，发送：

```prompt
Remove amp-runner-manager from my Personal Plugins. Ask before pushing the Personal Plugins repository, then reload the plugins.
```

Puck 请求授权时，批准推送。此操作会从跨设备同步的 Personal Plugins 中移除插件，不仅影响当前 Mac，但不会停止其他 Mac 上已安装的 Runner。如需卸载其他 Mac 上的 Runner，请在对应 Mac 上重复停止任务和删除 LaunchAgent 文件的步骤。其他现有线程需要重新加载插件，或改用新线程，才能应用插件移除结果。

### 3. 按需删除本地数据

以上步骤会保留本地配置、辅助脚本、watchdog 状态和日志。以下命令会永久删除项目注册信息、设置和日志；如需保留，请先备份。删除后再次安装时，需要重新注册项目。这些命令不会删除已注册的 Git 仓库，也不会卸载 Amp CLI。

```bash
rm -rf "$HOME/Library/Application Support/Amp Runner Manager"
rm -f \
  "$HOME/Library/Logs/amp-runner-manager.amp.log" \
  "$HOME/Library/Logs/amp-runner-manager.stdout.log" \
  "$HOME/Library/Logs/amp-runner-manager.stderr.log" \
  "$HOME/Library/Logs/amp-runner-manager-watchdog.log" \
  "$HOME/Library/Logs/amp-runner-manager-watchdog.stderr.log"
```

安装程序还会创建 `~/runner-manager` 作为管理 Runner 的工作目录。确认不再需要后，可用以下命令仅在目录为空时删除：

```bash
rmdir "$HOME/runner-manager"
```

如果 `rmdir` 提示目录非空，请先保留目录，检查其中的文件后再决定是否删除。

## 开发

```bash
bun install
bun run check
```

测试覆盖配置校验、项目解析、Runner ID 生成、plist 生成和 `launchctl` 命令边界。真实的 `launchd` 集成仍需在 macOS 上验证。
