# cc-notifier

Claude Code 会话通知系统(Windows):发生权限请求、AskUserQuestion 提问、工具执行出错或 Claude 等待输入时,若会话窗口未聚焦,通过 Windows Toast + 声音提醒;点击 Toast 可跳回对应会话窗口。零第三方 npm 依赖,由 Claude Code hooks 驱动;Toast 显示基于 Python winrt(进程内 Activated 回调实现点击跳转)。

## 架构

```
Claude Code hooks(SessionStart/PermissionRequest/PreToolUse/PostToolUse/Stop/SessionEnd)
  → scripts/notify-agent.mjs(转发器,秒级退出)
  → 本地 HTTP IPC(localhost 随机端口,daemon.json 握手)
  → scripts/daemon.mjs(常驻进程:会话集合、窗口映射、聚焦判定、去重)
  → scripts/toast-agent.py(Python winrt:Toast + 声音 + 点击进程内回调跳转)
```

- 通知方案:Windows Toast + 点击跳转(Python winrt 进程内回调)——`toast-agent.py` 显示 Toast 后保持存活,点击时 `Activated` 回调在独立线程触发 `SetForegroundWindow(hwnd)` 跳回会话窗口
- 常驻进程生命周期随会话:`SessionStart` 拉起,会话空 + 60s 超时自动退出,无开机自启
- 常驻进程不可用时自动降级为基础 Toast(无跳转),任何环节失败都不影响 Claude Code 会话

## 安装前提

- Windows 10/11
- Node.js(运行 hooks 转发器)
- Python 3 + winrt 包(`scripts/toast-agent.py` 依赖):
  `pip install winrt-runtime winrt-Windows.UI.Notifications winrt-Windows.Data.Xml.Dom winrt-Windows.Foundation`
- AUMID 注册(`HKCU\Software\Classes\AppUserModelId\cc-notifier`,Toast 显示前提)——`install.mjs` 安装时自动注册,无需手动操作

## 安装

```
node scripts/install.mjs
```

- 检测 Python 与 winrt 包(缺失时提示手动安装,不会自动安装)
- 备份并注入 hooks 到 `~/.claude/settings.json`(幂等,重复执行安全)
- 注册 AUMID `cc-notifier`(DisplayName/IconUri,Toast 显示前提)
- 生成默认配置 `~/.cc-notifier/config.json`
- 新开 Claude Code 会话后生效

## 卸载

```
node scripts/uninstall.mjs
```

- 移除注入的 hooks 并恢复安装前备份
- 清理 AUMID 注册表项
- daemon 随会话结束自动退出

## 项目级关闭

项目根目录创建 `.claude/cc-notifier.json`:

```json
{ "enabled": false }
```

优先级:项目级 > 全局配置 `~/.cc-notifier/config.json` > 默认值。

## 配置(~/.cc-notifier/config.json)

| 键 | 默认 | 说明 |
| --- | --- | --- |
| enabled | true | false 时全局关闭通知 |
| dedupWindowMs | 10000 | 失焦时同类事件去重窗口(毫秒) |
| sound | true | false 时 Toast 静音 |

## 手动测试

先确保一个 Claude Code 会话在运行(daemon 已启动),然后在 PowerShell 中:

```powershell
# 权限请求
'{"session_id":"smoke","cwd":"D:\Your\Project","hook_event_name":"PermissionRequest","tool_use":{"name":"Bash","input":{"command":"npm install"}}}' | node scripts/notify-agent.mjs permission-request

# AskUserQuestion 提问
'{"session_id":"smoke","cwd":"D:\Your\Project","hook_event_name":"PreToolUse","tool_use":{"name":"AskUserQuestion","input":{"questions":[{"prompt":"测试提问"}]}}}' | node scripts/notify-agent.mjs ask-user-question

# 工具执行出错
'{"session_id":"smoke","cwd":"D:\Your\Project","hook_event_name":"PostToolUse","tool_use":{"name":"Bash","input":{"command":"bad-command"}},"tool_response":{"is_error":true}}' | node scripts/notify-agent.mjs tool-result

# Claude 等待输入
'{"session_id":"smoke","cwd":"D:\Your\Project","hook_event_name":"Stop"}' | node scripts/notify-agent.mjs stop
```

注意:当前窗口聚焦时不会弹通知(聚焦静默);需把窗口切走后观察 Toast。
提示:Git Bash 的 `echo` 可能折叠 JSON 中的反斜杠导致解析失败,请使用 PowerShell。

## 日志与状态

- `%LOCALAPPDATA%\cc-notifier\daemon.json` — 常驻进程端口/pid(单实例握手)
- `%LOCALAPPDATA%\cc-notifier\notify-agent.log`、`daemon.log`、`toast-click.log` — 运行日志(超 1MB 自动截断)
- `%LOCALAPPDATA%\cc-notifier\history.jsonl` — 通知历史记录(本地可追溯)

## 故障排查

- 无通知:确认安装后新开了会话;确认 `enabled` 未关闭;确认会话窗口处于失焦
- 通知无跳转:常驻进程未运行(查看 daemon.log)或窗口标题解析失败(映射缺失时按「宁打扰勿漏」仍会通知)
- Toast 完全不显示:确认 Python 3 + winrt 包已安装(install.mjs 会检测);确认 AUMID 已注册(`reg query HKCU\Software\Classes\AppUserModelId\cc-notifier`);查看 toast-agent.log
- hook 未触发:检查 `~/.claude/settings.json` 中 hooks 条目是否被其他工具覆盖(重跑 install.mjs)
