## Why

用户无法持续盯着 Claude Code 对话窗口;当 Claude 停下等待用户介入(权限请求、提问、输出完成、工具报错)时,用户无法及时得知,任务进度被拖延。需要一个「Claude 需要你」时主动打扰用户的 Windows 桌面通知系统——类似 codex app 的行为:只有执行暂停、需要人介入时才通知。

## What Changes

- 新增 Node.js 通知脚本,由 Claude Code 官方 hooks 事件驱动,覆盖四类「中断时刻」:
  - `PermissionRequest`:Claude 请求工具权限时
  - `PreToolUse`(匹配 `AskUserQuestion` 工具):Claude 向用户提问时
  - `Stop`:Claude 输出完成、停下等待输入时
  - `PostToolUse`(检测 `tool_response` 错误):工具执行失败时
- 通知前检测目标会话窗口的聚焦状态:**用户聚焦于该会话窗口时不打扰**,失焦时才通知
- 使用 Windows 原生 Toast + 声音(PowerShell 调 WinRT 实现,零第三方依赖)
- Toast 正文携带上下文摘要(请求的命令 / 问题预览 / 错误信息)与项目名,多会话可区分
- 点击 Toast 可激活(聚焦)对应会话所在窗口,把用户注意力拉回 Claude Code
- 默认全局生效(配置于 `~/.claude/settings.json`),单个项目可通过项目级 `.claude/settings.json` 覆盖或关闭
- 不要求常驻后台进程;事件驱动、按需执行

## Capabilities

### New Capabilities

- `cc-notifier`: 在 Claude Code 需要用户介入且会话窗口未聚焦时,通过 Windows Toast + 声音通知用户;通知含上下文摘要与项目名;点击 Toast 可跳转回对应会话窗口;支持全局默认生效与项目级配置覆盖。

### Modified Capabilities

无。

## Impact

- 新增全局配置:用户级 `~/.claude/settings.json` 的 `hooks` 字段(安装脚本负责写入)
- 新增项目配置示例:项目级 `.claude/settings.json` 可覆盖/关闭通知
- 新增通知脚本与辅助脚本(安装、Toast 显示、窗口检测)
- 依赖:Node.js 运行时(现有环境已有)、Windows PowerShell 5.1+(WinRT 调用);无第三方 npm 依赖
- 运行环境:Windows 11(win32 平台)、Claude Code CLI(终端 / VS Code 集成终端)
