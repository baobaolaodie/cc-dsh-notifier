## Why

常驻进程(daemon)不可用时,转发器 `notify-agent.mjs` 走 fallback 降级路径 `showBasicToast`,spawn `toast-agent.py` 后**等待其退出**才结束 hook。而 toast-agent.py 显示 Toast 后保持存活(默认 20+5=25 秒)等待用户点击——**用户不点击 Toast,hook 就被阻塞 25 秒**,直接违反 spec「通知失败不阻断会话」需求。2026-08-13 真实环境实测:22:01-22:54 连续 16+ 次 fallback toast,每次 hook 阻塞 25 秒,严重拖慢 Claude Code 会话。

## What Changes

- `scripts/notify-agent.mjs` 的 `showBasicToast` 改为 **fire-and-forget**:spawn toast-agent.py 后立即 resolve,不等待子进程退出
- fallback Toast 仍正常显示(降级通知能力保留,不静默丢失);只是 hook 不再被阻塞
- 不改动 daemon 正常路径(daemon 已 fire-and-forget,不受影响)
- 无新 capability、无接口变更、无 spec 验收场景变化(修复使实现满足既有 spec)

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无(实现修复,满足既有 spec「通知失败不阻断会话」需求,不改变验收场景)。

## Impact

- `scripts/notify-agent.mjs`:`showBasicToast` 函数(spawn 后立即 resolve)
- 测试:`test/` 无行为断言变化;daemon 正常路径不受影响
- 依赖:无新增
