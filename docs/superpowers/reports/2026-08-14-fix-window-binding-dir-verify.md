# fix-window-binding-dir 验证报告

- Change: fix-window-binding-dir
- 日期: 2026-08-14
- verify_mode: light(源码改动 4 文件,无 delta spec)
- review_mode: off(1-4 文件、纯绑定逻辑,跳过自动审查)

## 轻量验证 6 项

1. tasks.md 全部完成 ✅ 4/4
2. 改动与 tasks 一致 ✅ daemon.mjs/win32.ps1/proc-dir.mjs/events.mjs
3. 构建通过 ✅ node --check + npm test(record-check 已记录)
4. 测试通过 ✅ 43/43
5. 无安全问题 ✅
6. review_mode=off 已记录原因 ✅

## 验证证据

- 绑定:hwnd=787836(Claude Code 标签,'?' 前缀识别);不再误绑 cmd 标签(32771162)
- 点击跳转:SetForegroundWindow(787836) ret=1,用户实测「成功跳到 Claude Code」
- 聚焦感知:聚焦时静默(bound 判定)
- normalizeCwd 分隔符统一:D:\foo == D:/foo(新增断言)

**All checks passed. Ready for archive.**
