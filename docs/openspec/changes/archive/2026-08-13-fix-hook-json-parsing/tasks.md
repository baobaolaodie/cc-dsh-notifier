## 1. 修复与验证

- [x] 1.1 复现:用真实 hook 格式 JSON 触发 parseEvent,确认 permission-request/ask-user-question 正文为空(实测 toolName="" summary="")
- [x] 1.2 修复 `scripts/lib/events.mjs` 的 `parseEvent`:扁平字段(tool_name/tool_input)优先,嵌套回退
- [x] 1.3 更新 `test/events.test.mjs`(真实格式 fixture 断言 + 嵌套回退断言)与 `scripts/test.mjs`(fixtures 改真实格式)
- [x] 1.4 验证:`npm test` 42/42 通过;真实格式触发后 Toast 正文包含具体事项(实测 body="Bash 请求执行:npm install")
