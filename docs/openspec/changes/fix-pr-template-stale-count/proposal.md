## Why

PR 模板与项目文档把**测试数量当常量写死**:`.github/PULL_REQUEST_TEMPLATE.md` 写 `npm test` → 45 pass(实际 58,且会继续增长)。`ci.yml` 的 pr-policy 要求 PR body 的复选框 label 与模板**精确匹配**(includes 判断),测试数一变,每个 PR 都得改 body 去凑 label——本次 PR #3 正是因此 CI 失败("PR body deleted or omitted checkbox '单元测试 / Unit tests:`npm t…'")。

同类硬编码共 10 处(仓库内 8 处 + 本地指令 2 处):PULL_REQUEST_TEMPLATE.md:22、greeting.yml:25、README 双版:155/165、CONTRIBUTING 双版:21、CLAUDE.md:25、AGENTS.md:25。

CHANGELOG 0.1.0 的「45 条单元测试」为历史发布记录,保留不动。

## 根因

测试数是动态值(随测试增长),却被当作静态常量写进模板与文档;pr-policy 的精确 label 匹配把这一缺陷放大为**每次 PR 的强制失败**。

## What Changes

- `.github/PULL_REQUEST_TEMPLATE.md:22`:`npm test` → 45 pass → `npm test` → 全部通过 / all pass(不绑定数字)
- `.github/workflows/greeting.yml:25`:`npm test` → 45 pass → `npm test` → all pass
- `README.md:155,165` / `README-zh.md:155,165`:`45 assertions` → 不绑定数字表述,保持中英镜像行数差 ≤10
- `CONTRIBUTING.md:21` / `CONTRIBUTING-zh.md:21`:同上
- 本地指令 `CLAUDE.md` / `AGENTS.md`(不入库):「45 断言」→ 「全部断言通过」,磁盘同步
- 交付阶段:已开 PR #3 分支 merge master 后,body 复选框 label 更新为新模板 label,重跑 CI

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无(纯模板/文档内容修复,pr-policy 检查逻辑不变,spec 验收场景不变,无需 delta spec)。

## Impact

- `.github/PULL_REQUEST_TEMPLATE.md`:label 文案变更;已开 PR #3 的 body 需在模板合并后同步更新(交付阶段处理)
- `.github/workflows/greeting.yml`:提示文案
- README / CONTRIBUTING(双语):命令注释与特性表
- 本地 CLAUDE.md / AGENTS.md:不入库,磁盘同步
