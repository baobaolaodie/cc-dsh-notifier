# scripts/balloon.ps1 — 托盘气泡通知(显示+声音+点击跳转+历史记录)
# 用法:balloon.ps1 -Title <标题> -Body <正文> [-Project <项目名>] [-Hwnd <窗口句柄>] [-NoSound]
# 点击气泡 → SetForegroundWindow(句柄) 跳转;通知内容追加到 %LOCALAPPDATA%\cc-notifier\history.jsonl
param(
  [string]$Title = 'cc-notifier',
  [string]$Body = '',
  [string]$Project = '',
  [long]$Hwnd = 0,
  [switch]$NoSound
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BalloonFg {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@

$dataDir = Join-Path $env:LOCALAPPDATA 'cc-notifier'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$historyFile = Join-Path $dataDir 'history.jsonl'
$clickLog = Join-Path $dataDir 'balloon.log'

# 历史记录(可追溯,弥补气泡不进操作中心)
try {
  $rec = [ordered]@{
    ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    project = $Project
    title = $Title
    body = $Body
  }
  Add-Content -Path $historyFile -Value ($rec | ConvertTo-Json -Compress) -Encoding UTF8
} catch {}

# 显示气泡
$display = if ($Project) { "$Project · $Title" } else { $Title }
$icon = New-Object System.Drawing.Icon([System.Drawing.SystemIcons]::Information, 32, 32)
$ni = New-Object System.Windows.Forms.NotifyIcon
$ni.Icon = $icon
$ni.Visible = $true
$ni.Text = 'cc-notifier'
$ni.BalloonTipTitle = $display
$ni.BalloonTipText = $Body
$ni.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info

$script:clicked = $false
$ni.Add_BalloonTipClicked({
  if ($Hwnd) {
    [BalloonFg]::ShowWindow([IntPtr]$Hwnd, 9) | Out-Null
    [BalloonFg]::SetForegroundWindow([IntPtr]$Hwnd) | Out-Null
  }
  $script:clicked = $true
})

# 声音(气泡本身无声,手动播放)
if (-not $NoSound) { [System.Media.SystemSounds]::Exclamation.Play() }

$ni.ShowBalloonTip(12000)  # 12 秒

# 消息泵等待点击或关闭(最多 18 秒)
$deadline = [DateTime]::Now.AddSeconds(18)
while (-not $script:clicked -and [DateTime]::Now -lt $deadline) {
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds 50
}
$ni.Dispose()
