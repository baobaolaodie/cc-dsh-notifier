## 1. 修复与验证

- [x] 1.1 复现:枚举窗口确认 explorer 标题含项目名被绑定(hwnd=1707360 非终端)
- [x] 1.2 修复 `scripts/daemon.mjs` SessionStart 绑定:枚举/前台兜底加进程白名单过滤
- [x] 1.3 验证:SessionStart 重绑后 hwnd=0(explorer 被排除,不再误绑);白名单逻辑单测通过(explorer 排除/终端保留)
- [x] 1.4 回归:`npm test` 42/42 通过;窗口映射/聚焦判定不受影响
