# 修复方案

单一方案:`docs/DEVELOPMENT-NOTES.md` 追加「2026-08-14 教训」一节,插在「已知问题」节之后、「恢复方法」节之前。

## 内容结构(三条教训)

1. **CIExpected 根因与 CI 汇总 job**:master 分支保护 `required_checks=["CI"]`(workflow 名),但 GitHub 不为此工作流产生工作流级 "CI" check run(只产生 job 级)→ PR 永远 "Waiting for status to be reported"。修复:ci.yml 新增同名汇总 job(`needs: [test, quality, pr-policy, docs-links]`)承担该 check;`if: !cancelled() && !failure()` 防止 push 路径(pr-policy 被跳过)连带跳过——**勿改为 `always()`**(依赖失败也报告通过,门禁失效)。
2. **pr-policy 的 webhook 快照坑**:`context.payload.pull_request.body` 是 run 触发瞬间的快照;`gh pr edit` 更新 body 后,已有 run(含重跑)仍用旧 body——必须新 push(如空提交)触发新 run 生成新快照。排查特征:本地模拟检查逻辑全过但 CI 必失败。
3. **模板 label 逐字节匹配**:ci.yml 用 `body.includes('- [x] ' + label)` 检查 PR body 的每个复选框,label 须与 `.github/PULL_REQUEST_TEMPLATE.md` 逐字节一致;模板 label 变更会立即破坏所有未更新 body 的已开 PR(先更新 body 再改模板,或改模板后同步所有 PR)。

## 验收

- 新节包含三条教训 + CI 汇总 job 的 if 语义警告
- 文档行数与既有风格一致,不破坏其他内容
