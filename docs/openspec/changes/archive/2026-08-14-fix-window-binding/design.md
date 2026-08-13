## Context

SessionStart 绑定代码(daemon.mjs):

```js
const all = await runWin32('enumerate');
for (const w of all) {
  if (matches(w.title)) { fgHwnd = w.hwnd; break; }
}
```

`runWin32('enumerate')` 返回全部可见窗口(win32.ps1 无进程过滤),explorer 等非终端窗口标题可能含项目名(文件管理器路径标签)而被误绑。

## 修复方案

复用 `window-map.mjs` 已导出的 `PROCESS_WHITELIST`,枚举与前台兜底都要求进程在白名单内:

```js
import { isWhitelistedProcess } from './window-map.mjs'; // 或复用 PROCESS_WHITELIST

const all = await runWin32('enumerate');
for (const w of all) {
  if (isWhitelistedProcess(w.processName) && matches(w.title)) { fgHwnd = w.hwnd; break; }
}
// 前台兜底同条件
const fg = await runWin32('foreground');
if (fg && fg[0] && isWhitelistedProcess(fg[0].processName) && matches(fg[0].title)) fgHwnd = fg[0].hwnd;
```

- `isWhitelistedProcess` 已处理 .exe 后缀(真实进程名不带 .exe,如 `WindowsTerminal`)
- explorer/msedge/explorer 等非白名单进程被排除 → 不再误绑
- 白名单内无匹配 → hwnd=0 → 回退窗口映射表(现有行为)

## 边界条件

- 窗口进程名获取失败(win32.ps1 中 Get-Process 失败 → processName=''):`isWhitelistedProcess('')` 返回 false → 跳过(宁可不绑,不误绑)
- 多终端窗口同标题:白名单内第一个匹配(现有行为,与修复前一致)
- VS Code 集成终端:Code.exe 在白名单,标题含项目名 → 正常绑定

## 测试策略

- 单元:window-map.test 已有 `isWhitelistedProcess` 覆盖(.exe 后缀、白名单判定)
- 手动:SessionStart 重新绑定后,toast 点击应跳到真实终端而非 explorer
