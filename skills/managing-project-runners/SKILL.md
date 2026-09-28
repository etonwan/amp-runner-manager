---
name: managing-project-runners
description: Starts and stops temporary Amp runners for registered Mac projects. Use when asked to launch, stop, register, remove, or list repo runners by project name.
builtin-tools:
  - register_project
  - remove_project
  - start_project_runner
  - stop_project_runner
  - list_project_runners
compatibility: Requires the amp-runner-manager plugin running on macOS.
---

# Managing Project Runners

Use the plugin tools as the source of truth for project mappings and runner state.

- For “在 `<项目名>` 启动 runner” or equivalent, call `start_project_runner` with the spoken project name. Do not ask for a path first.
- If lookup returns `not_found` or `ambiguous`, show its candidates and ask the user to choose. Never infer a filesystem path.
- Ask for an absolute path only when the user wants to register a project that is not registered.
- Use `register_project` once, including useful aliases supplied by the user. Do not invent aliases.
- Before removing a project whose runner is loaded, call `stop_project_runner` after user intent to stop is clear, then remove it.
- Project runners always enable remote terminal access.
- Report the stable runner ID and status after starts; report whether a stop actually unloaded a job.
