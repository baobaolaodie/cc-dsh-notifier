// PowerShell 桥:枚举窗口 / 取前台窗口,返回 [{hwnd, pid, title, processName}]
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PS = path.join(process.env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const SCRIPT = fileURLToPath(new URL('./win32.ps1', import.meta.url));

// 默认 10s:本机实测 PowerShell 启动 + Add-Type 冷编译约 3-6s,3s 超时会误伤
// extraProcs:逗号分隔的追加进程名(仅查询其命令行,如浏览器进程名,用于 CDP 端口发现)
// extraArgs:额外透传给 win32.ps1 的参数数组(如 console-hwnd 的 -TargetPid)
// 健壮性:execFile 的同步 spawn 失败(如 EPERM/受限环境)会直接 throw,
// 必须捕获并 resolve([]) —— 否则 daemon 首轮轮询即崩溃(2026-08-16 沙箱冒烟实测)
export function runWin32(action, timeoutMs = 10000, extraProcs = '', extraArgs = []) {
  return new Promise((resolve) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Action', action];
    if (extraProcs) args.push('-ExtraProcs', extraProcs);
    if (Array.isArray(extraArgs) && extraArgs.length) args.push(...extraArgs);
    try {
      execFile(
        PS,
        args,
        { encoding: 'utf8', timeout: timeoutMs, windowsHide: true },
        (err, stdout) => {
          if (err) return resolve([]);
          try {
            const data = JSON.parse(stdout);
            return resolve(Array.isArray(data) ? data : [data]); // PS 单窗口时管道输出裸对象,兜底成数组
          } catch { return resolve([]); }
        },
      );
    } catch { resolve([]); }
  });
}
// 从 win32.ps1 的 console-hwnd 返回中选择可用的跳转目标:
// - Windows Terminal 的 PseudoConsoleWindow 可见,但其 owner 才是真正的标签顶层窗口,
//   优先返回可见的 ownerHwnd;
// - 原生控制台窗口通常没有 owner,返回可见的 hwnd;
// - VSCode 集成终端的 PseudoConsoleWindow 不可见,返回 0,让现有标题/目录绑定继续生效。
export function pickConsoleTarget(info) {
  if (!info) return 0;
  const hwnd = Number(info.hwnd) || 0;
  const ownerHwnd = Number(info.ownerHwnd) || 0;
  if (ownerHwnd && info.ownerVisible) return ownerHwnd;
  if (hwnd && info.visible) return hwnd;
  return 0;
}
