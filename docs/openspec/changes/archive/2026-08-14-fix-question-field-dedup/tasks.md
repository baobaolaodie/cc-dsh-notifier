## 1. 修复与验证

- [x] 1.1 修复 `events.mjs` ask-user-question 提取 `questions[0].question`(兼容 prompt 回退)
- [x] 1.2 修复 `events.mjs` permission-request:tool_name=AskUserQuestion 时返回 null(去重双通知)
- [x] 1.3 更新测试:question 字段、prompt 回退、AskUserQuestion 权限跳过
- [x] 1.4 验证:`npm test` 45/45 通过;真实载荷解析出提问摘要;AskUserQuestion 只弹一个通知(权限请求跳过)
