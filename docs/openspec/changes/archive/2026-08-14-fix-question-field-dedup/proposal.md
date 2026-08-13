## Why

两个问题:

1. **提问摘要为空**:真实 PreToolUse(AskUserQuestion)载荷字段是 `tool_input.questions[0].question`(单数),`events.mjs` 用 `.prompt` 提取 → 提问通知只有标题无内容。2026-08-14 临时 hook 抓取真实载荷证实。

2. **AskUserQuestion 双通知**:Claude Code 对 AskUserQuestion 工具调用同时触发 `PreToolUse`(matcher=AskUserQuestion)与 `PermissionRequest` 两个 hook 事件,cc-notifier 对两者都发 Toast → 「提问」+「权限请求」两个通知,内容重复(权限请求的 tool_name 也是 AskUserQuestion)。

## What Changes

- `scripts/lib/events.mjs`:
  - ask-user-question:提取 `questions[0].question`(兼容 `.prompt` 回退)
  - permission-request:tool_name=AskUserQuestion 时返回 null(不通知)——提问场景由 PreToolUse 通知,避免双弹
- 测试:question 字段断言 + AskUserQuestion 权限请求跳过断言

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无(实现修复,满足既有 spec「通知内容」「中断事件触发通知」)。

## Impact

- `scripts/lib/events.mjs`:ask-user-question 字段 + permission-request 过滤
- `test/events.test.mjs`:新增断言
