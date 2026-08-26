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

在用于运行 Runner 的 Mac 上执行以下命令。命令会先创建 `~/runner-manager`，再创建并加载以该目录作为管理 Runner 工作目录的用户 LaunchAgent；LaunchAgent 使用当前的 Amp 可执行文件，并启用远程 Terminal。

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

检查管理 Runner 是否已加载：

```bash
launchctl print "gui/$(id -u)/com.amp.runner-manager"
```

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

默认情况下，项目必须位于当前用户的主目录中。如果需要限制或增加允许的根目录，请在首次注册项目之前，将 `AMP_RUNNER_MANAGER_ALLOWED_ROOTS` 添加到管理 LaunchAgent 的 `EnvironmentVariables` 中：

```xml
<key>EnvironmentVariables</key>
<dict>
  <!-- 保留已有的 PATH 和 AMP_RUNNER_MANAGER_AMP_PATH。 -->
  <key>AMP_RUNNER_MANAGER_ALLOWED_ROOTS</key>
  <string>/Users/alice/src:/Users/alice/work</string>
</dict>
```

在终端中通过 `export` 设置变量，不会更新已由 `launchd` 启动的管理 Runner。编辑 `~/Library/LaunchAgents/com.amp.runner-manager.plist` 后，检查文件并重新加载 LaunchAgent，使管理 Runner 获取新的环境变量。在让 Amp 首次注册项目前完成这些操作：

```bash
PLIST="$HOME/Library/LaunchAgents/com.amp.runner-manager.plist"
plutil -lint "$PLIST"
launchctl bootout "gui/$(id -u)/com.amp.runner-manager"
launchctl bootstrap "gui/$(id -u)" "$PLIST"
```

如果 `config.json` 已存在，请先停止管理 Runner，再编辑其中的 `allowedRoots` 数组。每个项目路径都必须是已存在的绝对路径，并指向 Git 仓库根目录。

## 常用操作

可以向 Amp 发出以下请求：

- 「列出项目 Runner。」
- 「启动 storefront 的 Runner。」
- 「停止 shop 的 Runner。」
- 「移除 storefront 项目。」

项目 Runner 的日志位于：

```text
~/Library/Application Support/Amp Runner Manager/logs/<runner-id>.stdout.log
~/Library/Application Support/Amp Runner Manager/logs/<runner-id>.stderr.log
```

查看最近的错误：

```bash
tail -n 100 "$HOME/Library/Application Support/Amp Runner Manager/logs/"*.stderr.log
```

## 卸载

先停止所有项目 Runner，再执行：

```bash
launchctl bootout "gui/$(id -u)/com.amp.runner-manager"
rm -f "$HOME/Library/LaunchAgents/com.amp.runner-manager.plist"
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
