## 1. 复现与修复

- [x] 1.1 复现:分支保护 required check "CI" 无落点(check suite 实测仅 9 个 job 级,无 "CI" 条目);PR #3 页面卡 "CIExpected — Waiting for status to be reported"
- [x] 1.2 `ci.yml`:新增名为 `CI` 的汇总 job(needs: test/quality/pr-policy/docs-links;YAML 解析验证通过)

## 2. 验证

- [ ] 2.1 验证:推送后 CI 产生 "CI" check run 且随汇总通过;PR 页面不再显示 CIExpected;`actionlint`(CI 自带)校验 workflow 语法通过
