## Why

master 分支保护要求 required status check **"CI"**(workflow 名),但本仓库的 GitHub 端**从不产生名为 "CI" 的工作流级 check run**——每次 CI 运行只产生 9 个 job 级 check(test×6 / quality / pr-policy / docs-links;实测 check suite 无 "CI" 条目,#2/#3 均如此)。分支保护因此永远等待 "CIExpected — Waiting for status to be reported",**PR 即使全部检查通过也无法满足合并条件**——#2 实际是靠 owner 强制合并(分支保护 `enforce_admins=false` 已失效),#3 正卡在此处。

## 根因

GitHub 只为本工作流创建 job 级 check run;required check 写的是 workflow 名 "CI",需要一个**同名 job 级 check** 作为落点。

## What Changes

- `.github/workflows/ci.yml`:末尾新增名为 `CI` 的汇总 job,`needs: [test, quality, pr-policy, docs-links]`,空步骤输出汇总信息——产生 job 级 "CI" check run,分支保护 required check 立即有落点
- 分支保护配置不改(required_checks 保持 `["CI"]`)

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无(CI 配置变更,spec 验收场景不变,无需 delta spec)。

## Impact

- `.github/workflows/ci.yml`:新增 1 个汇总 job(约 6 行)
- CI 运行时间:+~10s(一个 echo job)
- PR 合并条件:required check "CI" 由汇总 job 承担,全部检查通过后合并按钮解锁
