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

## 卸载

先停止所有项目 Runner，再执行：

```bash
launchctl bootout "gui/$(id -u)/com.amp.runner-manager.watchdog"
launchctl bootout "gui/$(id -u)/com.amp.runner-manager"
rm -f \
  "$HOME/Library/LaunchAgents/com.amp.runner-manager.watchdog.plist" \
  "$HOME/Library/LaunchAgents/com.amp.runner-manager.plist"
```

打开 Puck 并发送：

```prompt
Remove amp-runner-manager from my Personal Plugins. Ask before pushing the Personal Plugins repository, then reload the plugins.
```

本地配置和日志会保留。确认不再需要后再删除：

```bash
rm -rf "$HOME/Library/Application Support/Amp Runner Manager"
```

## 开发

```bash
bun install
bun run check
```

测试覆盖配置校验、项目解析、Runner ID 生成、plist 生成和 `launchctl` 命令边界。真实的 `launchd` 集成仍需在 macOS 上验证。
