## Context

真实 PreToolUse(AskUserQuestion)载荷(2026-08-14 临时 hook 抓取):

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "AskUserQuestion",
  "tool_input": { "questions": [{ "question": "...", "header": "...", "options": [...] }] }
}
```

同时 AskUserQuestion 工具调用还触发 PermissionRequest hook(tool_name=AskUserQuestion)。

## 修复方案

### 1. question 字段

`ask-user-question` 提取 `qs[0].question || qs[0].prompt`(question 优先,兼容旧调用方)。

### 2. 双通知去重

`permission-request` 中 `toolName === 'AskUserQuestion'` 时返回 null:

- AskUserQuestion 工具的权限请求与提问是同一时刻同一意图,PreToolUse 已发「提问」通知
- 跳过权限请求可消除双弹;若用户主动批准权限而非回答提问的场景,该跳过不影响(提问通知已涵盖)
- 其他工具(Bash/Write 等)权限请求不受影响

## 边界条件

- AskUserQuestion 权限被拒(用户拒绝工具调用):PreToolUse 不会触发?——实际 Claude Code 先 PermissionRequest 后 PreToolUse,若权限被拒则 PreToolUse 不触发,此时跳过权限通知会导致**漏通知**。权衡:权限请求通知"AskUserQuestion 请求执行"价值低(用户正面对提问),可接受;若需覆盖,可在拒绝场景由 Stop 兜底(现有 Stop 通知)。

## 测试策略

- ask-user-question:question 字段提取 + prompt 回退
- permission-request:AskUserQuestion 返回 null;Bash 正常
