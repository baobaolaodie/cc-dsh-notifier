<div align="right">

[English](USAGE.md) · 中文

</div>

# 使用方法

## 什么会被通知

Claude Code 需要你介入、且会话窗口未聚焦时,cc-notifier 弹出带声音的 Toast:

| 事件 | Hook | Toast 标题 | Toast 正文 |
|---|---|---|---|
| 权限请求 | `PermissionRequest` | 权限请求 | 工具 + 命令/路径(如 `Bash 请求执行:npm install`) |
| 提问 | `PreToolUse`(AskUserQuestion) | 提问 | 问题文本 |
| 工具报错 | `PostToolUse` | 工具出错 | 错误摘要 |
| 等待输入 | `Stop` | 等待输入 | `Claude 等待输入` |

会话窗口聚焦时静默,不通知。

## 点击 Toast

点击 Toast 将会话窗口带回前台。窗口在 SessionStart 时按以下优先级解析:

1. 进程工作目录(如 WindowsTerminal 以 `-d "<项目路径>"` 启动)
2. `?` 前缀标签标题(Claude Code 动态标题)
3. 标题含项目名(兜底)

daemon 不可用时,通知降级为无跳转的基础 Toast。

## 手动触发(测试)

需要 daemon 运行(有活跃会话)。先让会话窗口失焦——聚焦时会静默。

```bash
node scripts/test.mjs permission-request
node scripts/test.mjs ask-user-question
node scripts/test.mjs tool-result
node scripts/test.mjs stop
node scripts/test.mjs session-start
```

## 项目级关闭

项目根目录创建 `.claude/cc-notifier.json`:

```json
{ "enabled": false }
```

优先级:项目级 > 全局 `~/.cc-notifier/config.json` > 默认值。

## 全局配置

`~/.cc-notifier/config.json`:

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | `false` 全局关闭通知 |
| `dedupWindowMs` | `10000` | 失焦时同类事件去重窗口(毫秒) |
| `sound` | `true` | `false` 时 Toast 静音 |

## 多会话行为

每个会话在 SessionStart 时绑定各自窗口句柄。Toast 携带项目名,并行会话的通知可区分。不同会话的同类事件共享一个 10 秒去重窗口。

## 通知历史

每次通知追加到 `%LOCALAPPDATA%\cc-notifier\history.jsonl`(时间/项目/标题/正文)。可用于回溯错过的通知。
