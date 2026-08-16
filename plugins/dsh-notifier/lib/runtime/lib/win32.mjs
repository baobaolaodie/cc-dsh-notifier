// PowerShell 桥:枚举窗口 / 取前台窗口,返回 [{hwnd, pid, title, processName}]
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PS = path.join(process.env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const SCRIPT = fileURLToPath(new URL('./win32.ps1', import.meta.url));

// 默认 10s:本机实测 PowerShell 启动 + Add-Type 冷编译约 3-6s,3s 超时会误伤
// extraProcs:逗号分隔的追加进程名(仅查询其命令行,如浏览器进程名,用于 CDP 端口发现)
// 健壮性:execFile 的同步 spawn 失败(如 EPERM/受限环境)会直接 throw,
// 必须捕获并 resolve([]) —— 否则 daemon 首轮轮询即崩溃(2026-08-16 沙箱冒烟实测)
export function runWin32(action, timeoutMs = 10000, extraProcs = '') {
  return new Promise((resolve) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Action', action];
    if (extraProcs) args.push('-ExtraProcs', extraProcs);
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
