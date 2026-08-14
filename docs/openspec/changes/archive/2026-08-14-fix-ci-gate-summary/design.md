# 修复方案

单一方案:**ci.yml 新增名为 `CI` 的汇总 job**。不做多方案对比(hotfix 精简)。

## 实现

在 `.github/workflows/ci.yml` 末尾(现有 job 之后)追加:

```yaml
  # ── 汇总门禁:分支保护 required check "CI" 的落点 ──
  # GitHub 不为此工作流产生名为 "CI" 的工作流级 check run(实测 check suite 仅 9 个 job 级),
  # 分支保护 required_checks=["CI"] 永远等待 → PR 卡 "CIExpected — Waiting for status to be reported"。
  # 本 job 产生同名 job 级 check run,全部检查通过后合并条件即满足。
  CI:
    needs: [test, quality, pr-policy, docs-links]
    runs-on: ubuntu-latest
    steps:
      - run: echo "all CI checks passed"
```

## 要点

- job 名 `CI` 与 workflow 名 `CI` 同名:check run 名 = job 名,required check "CI" 匹配 job 级
- `needs` 覆盖全部 4 个检查 job(矩阵 test 作为一个整体依赖):任一失败则 `CI` 不运行/失败 → 保护拦截
- `docs-links` 与 `greeting` 不需要纳入:greeting 是欢迎注释,非门禁
- 分支保护配置(`required_checks: ["CI"]`)保持不变,无管理端操作

## 验收

- 推送后 CI 运行产生名为 "CI" 的 check run,状态与汇总一致
- PR 页面不再显示 "CIExpected — Waiting for status to be reported"
- 全部检查通过后 PR 满足合并条件(仅剩 1 人批准)
