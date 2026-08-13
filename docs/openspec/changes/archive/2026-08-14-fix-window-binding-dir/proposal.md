## Why

Claude Code 在终端中通过 OSC 转义序列动态设置窗口标题(`? <当前任务文本>`),标题随任务变化且**不含项目名**。导致 SessionStart 窗口绑定(依赖标题含项目名)在 Windows Terminal 场景**永远 hwnd=0**——点击 Toast 无法跳转(fix-window-binding 后 explorer 误绑已排除,但正常终端也绑不上了)。

实测:WindowsTerminal 启动命令行含可靠信号 `-d "D:\dev\cc-notifier"`(工作目录参数)。**用进程启动命令行匹配 cwd,比标题可靠**。

## What Changes

- `scripts/lib/win32.ps1`:枚举/前台窗口时采集进程启动命令行(`Get-CimInstance Win32_Process.CommandLine`,仅白名单进程、有可见窗口的 pid,按需查询避免全量 913ms 开销),附加 `commandLine` 字段
- `scripts/daemon.mjs` SessionStart 绑定:新增「进程目录匹配」信号——从命令行解析 `-d "<path>"`(WindowsTerminal)/`--directory`/无参数路径(Code 主进程),归一化后与 cwd 比较;目录匹配优先于标题匹配
- 保留标题匹配为次要信号(标题含项目名时仍可用,如 VS Code 主窗口)

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无(实现修复,满足既有 spec「点击跳转」需求)。

## Impact

- `scripts/lib/win32.ps1`:窗口结构附加 commandLine 字段
- `scripts/daemon.mjs`:SessionStart 绑定逻辑新增目录匹配
- `scripts/lib/window-map.mjs`:buildWindowMap 不受影响(聚焦判定仍用标题映射,标题解析已含规则 1 路径)
