## Context

当前仓库为空项目;环境为 Windows 11(win32)、已有 Node.js 运行时、Claude Code CLI 可用于终端与 VS Code 集成终端。动机见 proposal.md — Why。行为契约见 specs/cc-notifier/spec.md。无既有代码约束,可自由选择架构。

## Goals / Non-Goals

**Goals:**

- 以事件驱动(非常驻进程)方式实现全部通知能力
- 通知前正确判断「用户是否在看该会话窗口」
- 零第三方运行时依赖(仅 Node.js 内建能力 + Windows 系统自带 PowerShell/WinRT)
- 安装/回滚安全,不破坏用户已有 hooks 配置

**Non-Goals:**

- 不覆盖 hooks 事件之外的系统级异常(如 API 断连、token 耗尽)——这些场景 Claude 会停下等待,由 Stop 事件兜底通知
- 不做通知历史记录 UI、不做跨设备推送
- 不修改 Claude Code 本体,不写扩展/插件
- 不引入常驻后台进程(除非点击跳转方案不可行,作为最后备选)

## Decisions

### D1: 事件检测采用 Claude Code 官方 Hooks,而非后台监听或包装 CLI

| 方案 | 优势 | 劣势 |
|------|------|------|
| **Hooks(选定)** | 官方支持、事件准确(JSON 载荷含 cwd/session/tool 信息)、无常驻进程、零解析脆弱性 | 覆盖事件有限;需为 Stop 频率做过滤 |
| 后台监听 JSONL | 覆盖所有事件 | 常驻进程、解析脆弱、会话文件格式非公开 API |
| 包装 claude CLI | 实现直观 | 仅覆盖命令行启动场景,VS Code/桌面不可用 |

- `PermissionRequest` hook 覆盖权限请求;`PreToolUse`(matcher 匹配 `AskUserQuestion` 工具)覆盖提问;`Stop` 覆盖输出完成等待输入;`PostToolUse` 检查 `tool_response` 错误标志覆盖工具失败。
- 工具失败检测依赖 hook JSON 载荷,实现时确认载荷字段。

### D2: 通知展示用 Python winrt 投影调用 WinRT Toast,零第三方 npm 依赖

**Implementation Divergence(2026-08-13)**:原方案为 PowerShell 内联 WinRT 调用;Spike ① 实测发现 **PowerShell 5.1 的 WinRT 事件回调(add_Activated)不可靠**(点击 Toast 回调不触发),而 **Python winrt 投影的事件回调可靠**(独立线程触发,多次实测通过)。最终实现:`scripts/toast-agent.py`(Python winrt 投影)展示系统 Toast 并显式附带声音,进程存活期间点击 Toast → `Activated` 回调 → `SetForegroundWindow` 跳转。

- 依赖:Python 3 + winrt 包(`winrt-runtime`/`winrt-Windows.UI.Notifications`/`winrt-Windows.Data.Xml.Dom`),由 install.mjs 检测并提示安装
- 备选 `node-notifier`(需随包分发 SnoreToast 二进制)、`BurntToast`(需预装模块)、自绘窗口(侵入式)——均因依赖或体验不如原生 Toast。

### D3: 聚焦检测:前台窗口标题/进程与事件 cwd 匹配

hook JSON 载荷携带 `cwd`;通知脚本取其目录名,与当前前台窗口标题比对。标题含目录名片段 → 判定聚焦 → 静默。

- 进程级兜底:标题匹配失败时检查前台进程名是否为常见 Claude Code 宿主(WindowsTerminal/Code/pwsh 等)且该进程窗口仍无法排除时,降级为「保守静默」或「按配置通知」。
- 局限与误判风险见 Risks。

### D4: 点击跳转:WPF 自绘弹窗(替代 WinRT Toast)

**方案变更(2026-08-13,Spike ① 完整结论)**:非打包应用的 WinRT Toast 点击激活在本机**系统级不可用**——五条路径全部实测失败:

| 路径 | 结果 |
|------|------|
| 进程内 `Activated` 回调(PowerShell/Python winrt) | ACTIVATED 永不触发,DISMISSED 正常 |
| 快捷方式激活(AUMID + ToastActivatorCLSID) | lnk 属性写入不落盘(vt=0),系统不调用 |
| 协议激活(launch=ccn://) | 系统不执行 ShellExecute |
| COM 激活器(ctypes 手写 vtable,SUSPENDED+RESUME 时序) | SCM 连接失败(CO_E_OBJNOTCONNECTED) |
| COM 激活器(pywin32 框架) | 连接成功但仅支持 IDispatch(E_NOINTERFACE) |

系统对打包应用(codex/Docker,MSIX)的 toast 激活正常,但打包需要开发者模式,不作为本项目路径。

**最终方案:WPF 自绘弹窗(`scripts/ccn-balloon.exe`,csc 编译,零第三方依赖)**:
- 无边框圆角半透明卡片,屏幕右下角,淡入淡出动画,6 秒自动消失
- 点击弹窗 → `SetForegroundWindow(窗口句柄)` 直接跳转(自绘窗口的鼠标事件,不依赖系统激活)
- 附带系统提示音;通知内容追加 `%LOCALAPPDATA%\cc-notifier\history.jsonl`(弥补不进操作中心的追溯性)
- 由常驻进程 spawn,窗口句柄来自窗口映射表(D3)
- 备选已排除:`node-notifier`/`BurntToast`(第三方依赖)、WinRT Toast(点击激活不可用)

### D5: 配置体系:settings.json hooks 注入 + 项目覆盖

安装脚本读取并备份现有全局 `~/.claude/settings.json`,合并 `hooks` 配置(所有 hook 事件指向同一通知脚本,传入事件类型参数)。项目级 `.claude/settings.json` 若存在同 key hooks,由 Claude Code 天然的项目级优先语义实现覆盖;另提供项目级开关文件供「整项目关闭」使用。

### D6: 防抖:聚焦过滤 + 短窗口去重

聚焦过滤已排除「用户在看着」的场景;失焦场景下,脚本以事件时间戳做短窗口(约 10 秒)同类事件去重,防止权限请求→执行→Stop 等连续事件连发弹窗。

## Risks / Trade-offs

- [前台窗口标题不含 cwd 目录名(如终端标签被改名)导致误判聚焦而漏通知] → 标题匹配失败时按配置策略降级;提供手动测试命令
- [Windows 11 对未注册 AUMID 的非打包应用静默丢弃 Toast(已在 Spike ③ 实测确认)] → 安装脚本必须注册 AUMID(注册表方式已验证有效);卸载脚本清理注册;未注册时 Toast 不可见,降级为「仅日志记录」并提示重跑安装
- [hooks 注入破坏用户已有 settings.json 结构] → 安装脚本先备份、合并而非覆盖,提供卸载回滚
- [Stop 事件频率高造成通知轰炸] → D3 聚焦过滤 + D6 去重双保险
- [PermissionRequest 与随后的 Stop 双通知] → D6 去重窗口覆盖

## Migration Plan

1. 安装脚本:`node scripts/install.js` — 备份并合并全局 settings.json,写入 hooks,输出安装摘要
2. 卸载:`node scripts/uninstall.js` — 从 settings.json 移除 hooks 条目,恢复备份
3. 项目级覆盖:项目 `.claude/settings.json` 或开关文件
4. 回滚:任意时刻恢复安装前备份文件

## Open Questions

- 点击跳转(D4)的 AUMID 激活可行性 —— 实现期 spike 验证,若不可行则降级并更新设计
- `PostToolUse` hook 载荷中错误信息的可靠字段 —— 实现期确认,不影响 spec
- 声音是否需可配置开关 —— 后续可加配置项,不改变行为契约,不阻塞
