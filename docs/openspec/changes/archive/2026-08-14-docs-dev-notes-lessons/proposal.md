## Why

2026-08-14 排查 PR #3 CI 失败期间积累三条重要教训,对后续维护有直接价值,但 `docs/DEVELOPMENT-NOTES.md` 未记录:①分支保护 required check "CI" 无工作流级落点导致 PR 永久卡 "CIExpected"(已由 ci.yml 汇总 job 修复,但机制易被后续误改);②pr-policy 的 `context.payload.pull_request.body` 是 run 触发时的 webhook 快照,`gh pr edit` 不刷新已有 run(排查耗时最久的坑);③PR 模板 checkbox label 与 body 逐字节匹配机制。

## What Changes

- `docs/DEVELOPMENT-NOTES.md`:新增「2026-08-14 教训」一节,记录上述三条 + CI 汇总 job 的 `if` 守卫语义(勿改 `always()`)

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无(文档笔记更新,spec 验收场景不变,无需 delta spec)。

## Impact

- `docs/DEVELOPMENT-NOTES.md`:新增一节(约 20 行),其余不动
