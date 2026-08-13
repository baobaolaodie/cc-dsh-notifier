## Context

Claude Code 终端标题机制(2026-08-14 调研):
- 终端会话中输出 OSC 序列 `\x1b]0;? <任务文本>\x07` 动态设置标题
- Windows Terminal 标签显示该标题(`? 点击无反应排查子代理和shell`),不含项目名
- VS Code 主窗口标题固定为 `<项目名> - Visual Studio Code`(含项目名)

SessionStart 绑定现状:标题含 cwd 目录名枚举匹配。Windows Terminal 场景标题是动态任务文本 → 匹配不到 → hwnd=0 → 点击不跳转。

## 修复方案

### 1. win32.ps1:附加进程命令行

枚举每个窗口时,若进程在白名单(WindowsTerminal/Code/cmd/pwsh/powershell/conhost)且窗口可见,按 pid 查询 `Get-CimInstance Win32_Process` 的 CommandLine,附加到窗口对象:

```
{windows} → [{hwnd, pid, title, processName, commandLine}]
```

性能:只查有可见窗口的白名单进程(通常 <10 个),避免全量 913ms。实测单条查询 <50ms。

### 2. daemon.mjs:目录匹配信号

从 commandLine 解析候选目录(优先级):
1. WindowsTerminal: `-d "path"` / `--directory "path"`(实测格式)
2. Code 主进程: `"Code.exe" "D:\path\proj"`(无 --type 子进程、第二参数是路径)
3. 其他: 扫描 `-d`/`--dir`/`--directory`/`-w` 参数后路径

归一化(case-insensitive、去尾分隔符)后与事件 cwd 比较:
- 命中 → 绑定该窗口 hwnd(优先于标题匹配)
- 未命中 → 回退标题匹配(现有逻辑)

### 3. 测试

- win32.ps1:输出含 commandLine 字段,WindowsTerminal 的 `-d` 参数可解析
- daemon 绑定:目录匹配命中返回正确 hwnd;标题匹配保留为兜底

## 边界条件

- 进程命令行不可读(权限/已退出):commandLine 为空 → 跳过目录匹配,回退标题
- cmd.exe 在 WindowsTerminal 内运行(窗口 pid 是 conhost):conhost 命令行无目录 → 目录匹配 miss,标题兜底
- VS Code 集成终端:窗口 pid 是 Code 主进程,命令行第二参数是项目路径 → 命中
- 多终端同目录:第一个匹配(与现有行为一致)

## 测试策略

- 单测:命令行解析函数(纯函数,提取目录)
- 手动:SessionStart 重绑后绑定窗口为真实终端(hwnd 非 0),点击 toast 跳转成功
