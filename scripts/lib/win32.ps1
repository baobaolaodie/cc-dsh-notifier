# scripts/lib/win32.ps1 — user32 P/Invoke 封装:枚举可见顶层窗口 / 取前台窗口
# 注意:本文件须以 UTF-8 BOM 保存,否则 PowerShell 5.1 按 ANSI 解码中文注释会破坏语法
param(
  [ValidateSet('enumerate', 'foreground')]
  [string]$Action = 'enumerate'
)
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class Win32Bridge {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lp, int nMax);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  static string ProcName(uint pid) {
    try { return Process.GetProcessById((int)pid).ProcessName; }
    catch { return ""; }
  }
  public static object[] Windows() {
    var list = new List<object>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      int len = GetWindowTextLength(h);
      if (len <= 0) return true;
      var sb = new StringBuilder(len + 1);
      GetWindowText(h, sb, sb.Capacity);
      list.Add(new { hwnd = h.ToInt64(), pid, title = sb.ToString(), processName = ProcName(pid) });
      return true;
    }, IntPtr.Zero);
    return list.ToArray();
  }
  public static object Foreground() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return new { hwnd = 0L, pid = 0u, title = "", processName = "" };
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    int len = GetWindowTextLength(h);
    var sb = new StringBuilder(len + 1);
    GetWindowText(h, sb, sb.Capacity);
    return new { hwnd = h.ToInt64(), pid, title = sb.ToString(), processName = ProcName(pid) };
  }
}
'@
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($Action -eq 'enumerate') { $rows = @([Win32Bridge]::Windows()) } else { $rows = @([Win32Bridge]::Foreground()) }
$rows | ConvertTo-Json -Compress -Depth 4
