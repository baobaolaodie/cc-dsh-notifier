# 修复方案

单一方案:**所有位置统一改为不绑定具体数字的「全部通过 / all pass」表述**。不做多方案对比(hotfix 精简)。

## 替换清单(10 处)

| 文件 | 行 | 原文 | 改为 |
| --- | --- | --- | --- |
| `.github/PULL_REQUEST_TEMPLATE.md` | 22 | `npm test` → 45 pass | `npm test` → 全部通过 / all pass |
| `.github/workflows/greeting.yml` | 25 | `npm test` → 45 pass | `npm test` → all pass |
| `README.md` | 155 | 45 assertions | all assertions pass |
| `README.md` | 165 | 45 assertions across 5 files | all assertions pass across 5 test files |
| `README-zh.md` | 155 | 45 条断言 | 全部断言通过 |
| `README-zh.md` | 165 | 5 个文件 45 条断言 | 5 个测试文件全部断言通过 |
| `CONTRIBUTING.md` | 21 | 45 assertions | all assertions pass |
| `CONTRIBUTING-zh.md` | 21 | 45 断言 | 全部断言通过 |
| `CLAUDE.md`(本地,不入库) | 25 | 45 断言 | 全部断言通过 |
| `AGENTS.md`(本地,不入库) | 25 | 45 断言 | 全部断言通过 |

## 原则

- 中英镜像行数差保持 ≤10(CI 双语检查):每处替换均为同行内改词,行数不变
- CHANGELOG 0.1.0「45 条单元测试」为历史发布记录,不改
- pr-policy 检查逻辑(`ci.yml:148-151`)不改:label 精确匹配机制保留,只是模板不再含数字

## 交付衔接(已开 PR #3)

模板合并进 master 后:
1. `hotfix/20260814/fix-notification-i18n` 分支 merge master(获得新模板)
2. PR #3 body 复选框 label 更新为 `单元测试 / Unit tests:`npm test` → 全部通过 / all pass`
3. 重跑 CI,pr-policy 通过

## 验收

- 仓库内 8 处硬编码清零(除 CHANGELOG 历史记录)
- 双语镜像 7 对行数差 ≤10
- `npm test` 全过
- 新 PR(#4)body 用新模板 label,pr-policy 通过
