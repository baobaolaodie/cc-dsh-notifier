## Why

Claude Code 真实 hook JSON 载荷是**扁平格式**(`tool_name`/`tool_input`/`hook_event_name`),而 `events.mjs` 的 `parseEvent` 解析的是**嵌套格式**(`tool_use.name`/`tool_use.input`)——真实载荷中不存在 `tool_use` 字段,导致 permission-request 和 ask-user-question 事件的 toolName 与 summary **全部为空**。

真实影响(2026-08-13 history.jsonl 实测):22:00:41「提问」body=""、22:01:07「权限请求」body=""——通知只有标题、无具体事项。测试 fixture 使用了同样的错误嵌套格式,39/39 假通过。

## What Changes

- `scripts/lib/events.mjs` 的 `parseEvent` 兼容解析真实 hook JSON 扁平字段(`tool_name`/`tool_input`),保留嵌套 `tool_use` 回退
- `permission-request`:从 `tool_input.command`/`tool_input.file_path` 提取摘要
- `ask-user-question`:从 `tool_input.questions[0].prompt` 提取提问预览
- `tool-result`:从 `tool_name` 提取工具名(`tool_response` 字段本就正确)
- 更新 `test/events.test.mjs` 与 `scripts/test.mjs` fixtures 为真实 hook 格式

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无(实现修复,满足既有 spec「通知内容」需求,不改变验收场景)。

## Impact

- `scripts/lib/events.mjs`:`parseEvent` 字段解析
- `test/events.test.mjs`、`scripts/test.mjs`:fixture 格式修正
- 依赖:无新增
