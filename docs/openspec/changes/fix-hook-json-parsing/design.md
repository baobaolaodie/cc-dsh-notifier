## Context

Claude Code hook JSON 载荷(扩展源码 `extension.js` 证实,`e.tool_name`/`e.tool_input`/`e.hook_event_name`):

```json
{
  "session_id": "...", "cwd": "...", "hook_event_name": "PermissionRequest",
  "tool_name": "Bash", "tool_input": { "command": "npm install" }
}
```

而 `events.mjs` 的 `parseEvent` 用 `hookJson.tool_use.name`(嵌套)——真实载荷无此字段,解析为空。

## 修复方案

`parseEvent` 增加扁平字段优先解析,嵌套 `tool_use` 回退兼容:

```js
// 工具信息:真实 hook JSON 为扁平 tool_name/tool_input;嵌套 tool_use 兼容旧测试/调用方
const toolName = hookJson.tool_name || (hookJson.tool_use || {}).name || '';
const input = hookJson.tool_input || (hookJson.tool_use || {}).input || {};
```

- permission-request:摘要从 `input.command`(Bash)/`input.file_path`(文件工具)/`toolName` 提取
- ask-user-question:从 `input.questions[0].prompt` 提取(截断 80 字符)
- tool-result:`toolName` 用扁平字段;`tool_response` 保持原解析(字段本就正确)

## 测试策略

- `test/events.test.mjs`:新增真实格式 fixture 断言(扁平),保留嵌套回退断言
- `scripts/test.mjs`:fixtures 改为真实 hook 格式(与 notify-agent 实际收到的载荷一致)

## 边界条件

- 载荷无 `tool_name` 也无 `tool_use`(如 Stop/SessionStart):保持默认空值,不抛异常
- `tool_input` 缺失(如仅 tool_name):回退默认文案「请求执行权限」
- 非 Bash 工具:`tool_input.file_path` 提取「请求访问」
