# Amp Runner Manager

Amp Runner Manager 是一个仅适用于 macOS 的 Amp 插件。它让一台常驻的「管理 Runner」按项目名启动和停止临时 repo Runner。项目路径只在首次注册时提供，后续可以直接说：

> 帮我在 storefront 启动 runner。

插件提供以下工具：

- `register_project`
- `remove_project`
- `start_project_runner`
- `stop_project_runner`
- `list_project_runners`

插件还包含 `managing-project-runners` Skill。Skill 指导 Agent 根据自然语言选择工具；项目校验、配置持久化和进程管理均由插件实现。

## 架构

```text
管理 Runner（唯一开机自启的 Amp 进程）
  └─ Amp Runner Manager 插件
       ├─ config.json：name/aliases → canonical path
       └─ launchctl bootstrap gui/<uid> <临时 plist>
            └─ amp --no-tui --runner-id <稳定 ID>
```

repo Runner 由当前登录用户的 launchd GUI 域管理。插件将 plist 写入 `~/Library/Application Support/Amp Runner Manager/jobs/`，然后显式调用 `launchctl bootstrap`。插件不会把 plist 写入 `~/Library/LaunchAgents`，因此 macOS 登录或重启时不会自动加载 repo Runner。

launchd 负责持有、监控和停止进程。`KeepAlive` 使意外退出的 Runner 在当前登录会话中重启；`ThrottleInterval` 限制快速失败时的重启频率。`WorkingDirectory` 明确设置为已注册的项目根目录。标准输出和错误输出写入独立日志。

## 前置条件

- macOS
- 已安装并登录 Amp CLI
- Bun 仅用于开发和运行测试；Amp 使用自身内置的 Bun 运行插件
- 管理 Runner 必须在当前图形登录用户下运行，插件才能访问 `gui/<uid>` launchd 域

在 Linux 或 Orb 中调用工具时，插件返回明确的 `requires macOS` 错误。

## 安装插件

将仓库直接克隆到用户插件目录。Amp 不加载路径中包含符号链接的插件：

```bash
mkdir -p ~/.config/amp/plugins
git clone https://ampcode.com/@eton/amp-runner-manager \
  ~/.config/amp/plugins/amp-runner-manager
```

重新启动 Amp，或在 Amp 命令面板中执行 `plugins: reload`。插件不需要在运行时安装 npm 依赖。

检查插件和内置 Skill：

```bash
amp plugins list
amp skill info amp-runner-manager:managing-project-runners
```

## 配置

首次使用时，插件创建：

```text
~/Library/Application Support/Amp Runner Manager/
├── config.json
├── jobs/
└── logs/
```

目录权限为 `0700`，配置和 plist 权限为 `0600`。默认配置只允许注册当前用户主目录中的 Git 仓库。这个默认值避免访问系统目录，同时覆盖常见的 `~/src`、`~/code` 和 `~/Developer` 布局。

### 配置允许的根目录

在首次创建配置前，可以设置以冒号分隔的绝对路径：

```bash
export AMP_RUNNER_MANAGER_ALLOWED_ROOTS="$HOME/src:$HOME/work"
```

如果配置已经存在，编辑 `config.json` 中的 `allowedRoots`。每个值必须是已存在的绝对路径。例如：

```json
{
  "version": 1,
  "allowedRoots": ["/Users/alice/src", "/Volumes/work/repos"],
  "projects": []
}
```

修改配置前，停止并退出管理 Runner。不要同时手工编辑配置和调用插件工具。

### 配置 Amp 路径

插件不会假设 Amp 安装在固定位置。插件先读取 `AMP_RUNNER_MANAGER_AMP_PATH`；未设置时，插件在管理 Runner 的 `PATH` 中查找 `amp`，然后保存解析后的真实绝对路径到 launchd plist。

如果管理 Runner 的环境无法找到 Amp，请设置：

```bash
export AMP_RUNNER_MANAGER_AMP_PATH="$(command -v amp)"
```

该值必须是可执行文件的绝对路径。

## 首次注册项目

项目必须位于 `allowedRoots` 内，且传入路径必须是 Git 仓库根目录。

可以对 Agent 说：

> 注册项目 storefront，路径是 `/Users/alice/src/storefront`，别名是 shop 和 web。

Agent 调用：

```json
{
  "name": "storefront",
  "path": "/Users/alice/src/storefront",
  "aliases": ["shop", "web"]
}
```

名称和别名不区分大小写，必须全局唯一。允许 ASCII 字母、数字、点、下划线和连字符。Runner ID 根据项目名和 canonical path 稳定生成，例如 `amp-storefront-a1b2c3d4e5`。

## 启动、查看和停止

自然语言示例：

- 「帮我在 storefront 启动 runner」
- 「在 shop 启动 runner，并允许远程控制终端」
- 「列出项目 runner」
- 「停止 storefront 的 runner」
- 「移除 storefront 项目」

`start_project_runner` 默认不启用远程终端。只有明确需要时，才传入：

```json
{
  "project": "storefront",
  "remote_control_terminal": true
}
```

如果名称未命中，工具返回可能的候选项。如果多个项目部分匹配，工具返回 `ambiguous` 和候选项。插件不会选择候选项，也不会推测路径。

`list_project_runners` 返回注册名称、别名、canonical path、Runner ID、launchd 加载状态、可选的 PID 和日志路径。是否加载通过 `launchctl print` 的退出状态判断；`state`、`pid` 和 `lastExitCode` 仅作为诊断字段，因为 Apple 不保证 `launchctl print` 文本格式稳定。

## 日志

每个项目有两个日志文件：

```text
~/Library/Application Support/Amp Runner Manager/logs/<runner-id>.stdout.log
~/Library/Application Support/Amp Runner Manager/logs/<runner-id>.stderr.log
```

查看最近错误：

```bash
tail -n 100 "$HOME/Library/Application Support/Amp Runner Manager/logs/"*.stderr.log
```

如果 Runner 快速反复退出，先查看 stderr 日志。修复认证、网络或 Amp 路径问题后，调用 `stop_project_runner`，再重新启动。

## 管理 Runner 开机自启示例

只有管理 Runner 应安装到 `~/Library/LaunchAgents`。先将下列内容中的用户名、Amp 路径和工作目录替换为实际绝对路径，再保存为 `~/Library/LaunchAgents/com.example.amp-runner-manager.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.example.amp-runner-manager</string>
    <key>ProgramArguments</key>
    <array>
      <string>/opt/homebrew/bin/amp</string>
      <string>--no-tui</string>
      <string>--runner-id</string>
      <string>runner-manager</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/alice</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
      <key>AMP_RUNNER_MANAGER_AMP_PATH</key>
      <string>/opt/homebrew/bin/amp</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/alice/Library/Logs/amp-runner-manager.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/alice/Library/Logs/amp-runner-manager.stderr.log</string>
  </dict>
</plist>
```

验证并加载：

```bash
plutil -lint ~/Library/LaunchAgents/com.example.amp-runner-manager.plist
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.example.amp-runner-manager.plist
launchctl print "gui/$(id -u)/com.example.amp-runner-manager"
```

这个 plist 只启动管理 Runner。插件动态创建的 repo Runner 不会写入 `~/Library/LaunchAgents`。

## 安全设计

- 使用 `realpath` 解析项目路径和允许的根目录，然后按路径边界检查包含关系。符号链接不能绕过根目录限制。
- 要求绝对路径、已存在目录和 Git 仓库根目录。子目录、非 Git 目录和根目录之外的路径均被拒绝。
- 名称、别名、canonical path 和稳定 Runner ID 均执行冲突检测。
- 所有外部程序都使用参数数组执行。插件不构造 shell 命令，不对用户输入执行 shell 展开。
- plist 对 XML 特殊字符编码。`ProgramArguments` 将每个参数保存为独立字符串。
- 项目移除前检查 launchd job；仍在加载时拒绝移除，避免遗留无法管理的 Runner。
- 配置写入使用同目录临时文件和原子重命名。单个插件进程中的修改操作串行执行。
- `remote_control_terminal` 默认关闭。启用后，Amp 网页端可以访问 Runner 终端；仅在确有需要时启用。

插件继承管理 Runner 的用户权限。允许的根目录不是 macOS 沙箱，不能替代文件权限或操作系统访问控制。

## 卸载

1. 调用 `list_project_runners`，确认所有项目 Runner 均已停止。
2. 卸载并删除管理 Runner 的 LaunchAgent：

   ```bash
   launchctl bootout "gui/$(id -u)/com.example.amp-runner-manager"
   rm ~/Library/LaunchAgents/com.example.amp-runner-manager.plist
   ```

3. 删除插件目录：

   ```bash
   rm -rf ~/.config/amp/plugins/amp-runner-manager
   ```

4. 如果不再需要项目映射和日志，再删除状态目录：

   ```bash
   rm -rf "$HOME/Library/Application Support/Amp Runner Manager"
   ```

最后一步会永久删除配置和日志，不是卸载插件的必要步骤。

## 开发和验证

```bash
bun install
bun run check
```

Orb 可以验证名称解析、冲突检测、路径边界、Git 根目录校验、符号链接处理、plist 生成、launchctl 命令生成和状态文本的容错解析。Orb 不是 macOS，不能验证真实 `launchctl` 集成。

### 真实 Mac 手工验证

1. 安装插件并注册一个测试 Git 仓库。
2. 启动 Runner，确认 `launchctl print "gui/$(id -u)/<label>"` 成功，且 Amp Runner 列表显示稳定 ID。
3. 从该 Runner 创建线程，执行 `pwd`，确认 cwd 是注册仓库的 canonical path。
4. 分别在关闭和开启 `remote_control_terminal` 时启动 Runner，确认网页终端访问行为符合配置。
5. 终止 Runner 进程，确认 launchd 在当前会话中重新启动进程。
6. 调用停止工具，确认 job 被 bootout，且进程和临时 plist 均被移除。
7. 启动一个 repo Runner 后重启 Mac，确认 repo Runner 没有自动恢复；管理 Runner 应按 LaunchAgent 配置恢复。
8. 测试包含空格和 XML 特殊字符的合法仓库路径，并检查 stdout/stderr 日志。

在完成这些步骤前，不应将真实 macOS 集成视为已验证。
