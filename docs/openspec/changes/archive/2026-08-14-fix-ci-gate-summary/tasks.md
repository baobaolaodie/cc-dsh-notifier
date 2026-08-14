## 1. 复现与修复

- [x] 1.1 复现:分支保护 required check "CI" 无落点(check suite 实测仅 9 个 job 级,无 "CI" 条目);PR #3 页面卡 "CIExpected — Waiting for status to be reported"
- [x] 1.2 `ci.yml`:新增名为 `CI` 的汇总 job(needs: test/quality/pr-policy/docs-links;YAML 解析验证通过)

## 2. 验证

- [x] 2.1 验证:本地 YAML 解析验证通过(5 job,CI needs 正确);推送后验证(CI 产生 "CI" check run、页面不再 CIExpected、actionlint 通过)在交付阶段执行并记录
