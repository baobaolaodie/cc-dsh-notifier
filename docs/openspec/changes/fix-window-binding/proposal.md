## Why

`daemon.mjs` SessionStart 窗口绑定逻辑按"窗口标题含 cwd 目录名"枚举**所有可见窗口**匹配,未限定进程类型。实测(2026-08-14)explorer 资源管理器窗口标题「cc-notifier 和 1 个其他选项卡」含项目名被误绑(hwnd=1707360),而真实终端是 WindowsTerminal(hwnd=787836)。后果:点击 Toast → `SetForegroundWindow(1707360)` 跳到资源管理器 → 用户感知为「跳转无效/挑错窗口」。

## What Changes

- `scripts/daemon.mjs` SessionStart 窗口绑定:
  - 枚举匹配加**进程白名单过滤**(复用 `window-map.mjs` 的 `PROCESS_WHITELIST`:WindowsTerminal/Code/cmd/pwsh/powershell/conhost),非终端宿主进程(explorer 等)不参与匹配
  - 前台兜底同样按白名单过滤
- 白名单内无匹配时保持 hwnd=0(回退标题映射),宁打扰勿漏策略不变

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无(实现修复,满足既有 spec「点击跳转」需求,不改变验收场景)。

## Impact

- `scripts/daemon.mjs`:SessionStart 绑定逻辑(枚举/前台两条路径)
- 依赖:复用 `window-map.mjs` 的 `PROCESS_WHITELIST`(已导出)
