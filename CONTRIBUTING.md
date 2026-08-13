# Contributing to cc-notifier

感谢你考虑为 cc-notifier 贡献代码。以下是参与开发的流程与约定。

## 开发环境

- Windows 10/11
- Node.js 18+
- Python 3 + winrt 包:`pip install winrt-runtime winrt-Windows.UI.Notifications winrt-Windows.Data.Xml.Dom`
- 可选:一个正在运行的 Claude Code 会话(用于手动触发测试)

## 运行测试

```bash
npm test                    # 全部单元测试(45 断言,node:test)
node --test test/events.test.mjs   # 单个测试文件
node scripts/test.mjs <事件> # 经真实管线手动触发(permission-request|ask-user-question|tool-result|stop|session-start)
```

手动触发注意:需 daemon 运行(有活跃会话);当前窗口聚焦时不弹(聚焦静默),需切走窗口观察。

## 变更流程

本项目使用 Comet Classic workflow 管理变更。开始任何改动前:

1. 运行 `comet resume-probe . --stdin --json` 检查是否存在活跃 change
2. 无活跃 change 时,通过 `/comet-classic`(完整流程)或 `/comet-hotfix`(缺陷修复预设)创建 change
3. 写操作受 Comet hook 守卫约束:无 active change 时 Write/Edit 会被拦截,必须先走 Comet 流程

修复缺陷优先用 hotfix 预设(open → build → verify → archive),新增能力走完整流程。

## 代码约定

- 零第三方 npm 依赖是硬约束——新功能不得引入 npm 包
- `events.mjs` 的 `parseEvent` 必须兼容真实 hook JSON 扁平格式(`tool_name`/`tool_input`)与嵌套 `tool_use` 回退;AskUserQuestion 字段是 `questions[0].question`
- `win32.ps1` 必须保持 UTF-8 BOM(PS 5.1 解码中文注释依赖它)
- 新增逻辑需配套单元测试(`test/*.test.mjs`,node:test)

## 提交规范

- 提交信息遵循 Conventional Commits:`fix:` / `feat:` / `docs:` / `chore:` 前缀
- 每个 Comet change 完成后由流程自动提交,勿混入无关改动

## 提交流程

1. Fork 本仓库
2. 创建功能分支(`git checkout -b feature/your-change`)
3. 提交改动(`git commit -m 'fix: describe the change'`)
4. 推送到分支(`git push origin feature/your-change`)
5. 发起 Pull Request
