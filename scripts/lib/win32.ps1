# scripts/lib/win32.ps1 — user32 P/Invoke 封装:枚举可见顶层窗口 / 取前台窗口 / UIA 激活 tab
# 注意:本文件须以 UTF-8 BOM 保存,否则 PowerShell 5.1 按 ANSI 解码中文注释会破坏语法
# 每个窗口附加 commandLine(进程启动命令行,仅白名单进程按 pid 查询),供 SessionStart
# 目录匹配绑定(Claude Code 动态终端标题不含项目名,2026-08-14 调研结论);
# -ExtraProcs 追加查询命令行的进程名(dsh 适配:浏览器进程,用于 CDP 端口发现);
# -Action activate-tab:经 UIA 在指定浏览器窗口内激活标题匹配 -Match 的标签页
# (dsh 适配:toast 点击时精确跳转到 DeepSeek Harness 页面,无需浏览器调试端口)
param(
  [ValidateSet('enumerate', 'foreground', 'activate-tab', 'poll')]
  [string]$Action = 'enumerate',
  [string]$ExtraProcs = '',
  [long]$Hwnd = 0,
  [string]$Match = ''
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
if ($Action -eq 'activate-tab') {
  # UIA 激活 tab:在指定浏览器窗口(hwnd)内找标题匹配 -Match 的 TabItem 并 Select。
  # Edge/Chrome 的标签条对 UIA 暴露 TabItem(名称=标签标题),无需浏览器调试端口。
  try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$Hwnd)
    if (-not $root) { @{ ok = $false; error = 'FromHandle null' } | ConvertTo-Json -Compress; exit }
    $cond = New-Object System.Windows.Automation.PropertyCondition -ArgumentList @(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::TabItem)
    $tabs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
    $hit = $null
    foreach ($t in $tabs) {
      if ($t.Current.Name -match $Match) { $hit = $t; break }
    }
    if ($hit) {
      $pattern = $hit.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
      $pattern.Select()
      @{ ok = $true; name = $hit.Current.Name } | ConvertTo-Json -Compress
    } else {
      $names = @(); foreach ($t in $tabs) { $names += $t.Current.Name }
      @{ ok = $false; count = $tabs.Count; names = ($names -join ' | ') } | ConvertTo-Json -Compress
    }
  } catch {
    @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
  }
  exit
}
# poll:窗口表 + 前台句柄一次取回(daemon 轮询用;聚焦判定用缓存的 foreground,
# 消除「事件到达时聚焦、判定完成时已切走」的 1.6s PowerShell 竞态)
$fg = [Win32Bridge]::Foreground()
if ($Action -eq 'enumerate' -or $Action -eq 'poll') { $rows = @([Win32Bridge]::Windows()) } else { $rows = @($fg) }

# 只对白名单进程按 pid 查询命令行(WindowsTerminal/Code/cmd/pwsh/powershell/conhost +
# -ExtraProcs 追加进程);Get-CimInstance 按 pid 单条查询(实测 <50ms);避免全量 913ms 开销
$WANT = @('WindowsTerminal', 'Code', 'cmd', 'pwsh', 'powershell', 'conhost')
if ($ExtraProcs) {
  $WANT += @($ExtraProcs -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
}
$wantedPids = @($rows | Where-Object { $_.pid -gt 0 -and $WANT -contains $_.processName } | Select-Object -ExpandProperty pid -Unique)
$cmdMap = @{}
if ($wantedPids.Count -gt 0) {
  try {
    $procs = Get-CimInstance Win32_Process -Filter ("ProcessId=" + ($wantedPids -join ' OR ProcessId=')) -ErrorAction SilentlyContinue
    foreach ($p in $procs) { $cmdMap[[int]$p.ProcessId] = [string]$p.CommandLine }
  } catch { /* 查询失败则 commandLine 为空 */ }
}
foreach ($r in $rows) {
  $cl = ''
  if ($cmdMap.ContainsKey([int]$r.pid)) { $cl = $cmdMap[[int]$r.pid] }
  $r | Add-Member -NotePropertyName commandLine -NotePropertyValue $cl -Force
}
if ($Action -eq 'poll') {
  @{ entries = $rows; foreground = $fg } | ConvertTo-Json -Compress -Depth 4
} else {
  $rows | ConvertTo-Json -Compress -Depth 4
}
