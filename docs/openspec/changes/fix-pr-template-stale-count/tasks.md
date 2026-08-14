## 1. 复现与修复

- [x] 1.1 复现:PR #3 pr-policy CI 失败证据(模板 label `→ 45 pass` vs body `→ 58 pass` 不匹配);模板 45 与实际 58 不符
- [x] 1.2 `.github/PULL_REQUEST_TEMPLATE.md:22`:label 改为 `npm test` → 全部通过 / all pass
- [x] 1.3 `.github/workflows/greeting.yml:25`:`npm test` → all pass
- [x] 1.4 `README.md` / `README-zh.md`:155/165 行改不绑定数字(中英同步)
- [x] 1.5 `CONTRIBUTING.md` / `CONTRIBUTING-zh.md`:21 行改不绑定数字
- [x] 1.6 本地 `CLAUDE.md` / `AGENTS.md`(不入库):「45 断言」→「全部断言通过」

## 2. 验证与交付衔接

- [x] 2.1 验证:仓库内 8 处硬编码清零(CHANGELOG 历史记录除外);双语镜像 7 对行数差 ≤10;`npm test` 全过
- [ ] 2.2 交付衔接(模板合并后):#3 分支 merge master → PR #3 body label 更新为新模板 → 重跑 CI 通过
