<div align="right">

[English](USAGE.md) · [中文](USAGE-zh.md)

</div>

# 使用方法

## 什么会被通知

Claude Code 或 DeepSeek Harness 需要你介入、且会话窗口未聚焦时,cc-notifier 弹出带声音的 Toast:

| 事件 | 来源 | Toast 标题 | Toast 正文 |
|---|---|---|---|
| 权限请求 | Claude:`PermissionRequest`;dsh:`approval/asked` | 权限请求 / Permission request | 工具 + 原因(如 `Bash 请求执行:npm install` / `Bash requested to run: npm install`) |
| 提问 | Claude:`PreToolUse`(AskUserQuestion);dsh:`tool/call` | 提问 / Question | 问题文本 |
| 工具报错 | Claude:`PostToolUse`;dsh:`tool/result`(isError) | 工具出错 / Tool error | 错误摘要 |
| 等待输入 | Claude:`Stop`;dsh:`agent/status` idle | 等待输入 / Waiting for input | `Claude 等待输入` / `DeepSeek Harness 等待输入` |

Toast 文案默认跟随系统显示语言(`auto`),可由配置项 `language`(`zh`/`en`)覆盖。

会话窗口聚焦时静默,不通知。聚焦在事件到达瞬间实时判定(前台实时查询),切走立即生效。

## 点击 Toast

点击 Toast 将会话窗口带回前台。

- **Claude Code / dsh tui** — SessionStart 绑定的终端窗口,按进程工作目录、`?` 前缀标签标题、标题含项目名依次解析。
- **dsh web** — 置前浏览器窗口并经 UIA 激活 DeepSeek Harness tab(候选匹配:会话标题 → 产品名)。

daemon 不可用时,通知降级为无点击跳转的基础 Toast。

## DeepSeek Harness(dsh)

`dsh-notifier` 插件把 dsh 会话事件转发进同一条管线。两个 profile 共用一次安装;surface 按进程参数中的 profile 名自动检测。

- **web profile** — 事件绑定浏览器窗口;前台浏览器窗口的活动 tab 是任意 DeepSeek Harness 页面时静默。
- **dsh-tui profile** — 事件绑定终端窗口。

daemon 生命周期全自动:任意通知事件唤醒;最后一个会话结束后 60 秒退出;宿主退出经 `hostPid` 探测约 90 秒内清理;daemon 重启后会话自动重注册;修改 daemon 代码 10 秒内自动重启。

## 手动触发(测试)

需要 daemon 运行(有活跃会话)。请先切走焦点 —— 聚焦时 Toast 会被静默。

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
| `dedupWindowMs` | `0` | 去重窗口(毫秒);`0` = 不去重;`>0` 时按「会话+类型」合并 |
| `stopSuppressMs` | `15000` | 用户交互后代理进入等待输入不弹 Toast 的窗口 |
| `pythonPath` | 空 | Toast 解释器绝对路径(安装时写入) |
| `pollIntervalMs` | `10000` | daemon 窗口轮询周期(毫秒) |
| `windowWhitelist` | `[]` | 浏览器进程白名单(dsh web 绑定/聚焦用) |
| `sound` | `true` | `false` 时 Toast 静音 |
| `language` | `auto` | Toast 语言:`auto`、`zh` 或 `en` |

## 多会话行为

每个会话在 SessionStart 时绑定各自窗口句柄。Toast 携带会话身份,并行会话的通知可区分。去重默认关闭 —— 并发会话互不吞通知;开启时按会话与类型合并。

## 通知历史

每次通知追加到 `%LOCALAPPDATA%\cc-notifier\history.jsonl`(时间/项目/标题/正文)。可用于回溯错过的通知。
