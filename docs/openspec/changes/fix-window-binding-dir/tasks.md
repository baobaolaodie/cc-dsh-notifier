## 1. 修复与验证

- [x] 1.1 复现:SessionStart 绑定 hwnd=0(终端标题为动态任务文本不含项目名,点击不跳转)
- [x] 1.2 增强 `scripts/lib/win32.ps1`:枚举/前台附加进程命令行(仅白名单进程按需查询,实测 3 窗口 <100ms)
- [x] 1.3 新增 `proc-dir.mjs` 目录解析 + daemon SessionStart 绑定:目录信号限定进程 → 进程内 `? ` 前缀标签优先(Claude Code 动态标题特征)→ 标题兜底;同时修复 `normalizeCwd` 分隔符统一(D:\foo 与 D:/foo 等价)
- [x] 1.4 验证:重绑后 hwnd=787836(Claude Code 所在标签);点击 Toast `SetForegroundWindow(787836) ret=1` 成功跳转(用户实测确认);`npm test` 43/43 通过
