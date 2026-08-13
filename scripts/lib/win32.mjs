// PowerShell 桥:枚举窗口 / 取前台窗口,返回 [{hwnd, pid, title, processName}]
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PS = path.join(process.env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const SCRIPT = fileURLToPath(new URL('./win32.ps1', import.meta.url));

// 默认 10s:本机实测 PowerShell 启动 + Add-Type 冷编译约 3-6s,3s 超时会误伤
export function runWin32(action, timeoutMs = 10000) {
  return new Promise((resolve) => {
    execFile(
      PS,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Action', action],
      { encoding: 'utf8', timeout: timeoutMs, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve([]);
        try {
          const data = JSON.parse(stdout);
          return resolve(Array.isArray(data) ? data : [data]); // PS 单窗口时管道输出裸对象,兜底成数组
        } catch { return resolve([]); }
      },
    );
  });
}
