# Pull Request

## 摘要 / Summary

<!-- 标题须为 Conventional Commits:<type>(<scope>): <subject>,如 fix: ... / feat: ... / docs: ... / ci: ... -->
<!-- Title must be Conventional Commits: <type>(<scope>): <subject>, e.g. fix: ... / feat: ... / docs: ... / ci: ... -->
<!-- 结构引导:动机(为什么做)→ 做法(改了什么)→ 影响(影响范围与验证依据) / Structure: Motivation → What changed → Impact -->

## 改动范围(勾选)/ Scope of Changes (check)

- [ ] 事件解析 / Event parsing(`scripts/lib/events.mjs`)
- [ ] 窗口绑定 / Window binding(`scripts/daemon.mjs`, `scripts/lib/proc-dir.mjs`, `scripts/lib/window-map.mjs`)
- [ ] Toast 显示 / Toast display(`scripts/toast-agent.py`)
- [ ] 安装/卸载 / Install / Uninstall(`scripts/install.mjs`, `scripts/uninstall.mjs`)
- [ ] 配置 / Config(`scripts/lib/config.mjs`)
- [ ] 文档 / Docs(README / docs / CHANGELOG / CONTRIBUTING)
- [ ] 其他 / Other:

## 验证(勾选已执行)/ Verification (check executed)

<!-- 关键验证输出请粘贴到验证段下方,reviewer 可直接核验 / Paste key verification output below so reviewers can check directly -->
- [ ] 单元测试 / Unit tests:`npm test` → 全部通过 / all pass
- [ ] 手动验证 / Manual verification(描述场景 / describe the scenario):
- [ ] 文档改动:中英双语同步 / Doc changes: EN and ZH mirrored
- [ ] 如有未运行的验证项(说明原因)/ Not run if any (explain):

## 自查(勾选)/ Self-check (check)

- [ ] 提交信息为纯描述(无代号、编号、行话)/ Commit messages are plain descriptions (no codes, numbers, jargon)
- [ ] 零第三方 npm 依赖约束保持 / Zero third-party npm dependencies maintained
- [ ] hook JSON 扁平格式兼容未破坏 / Flat hook JSON format compatibility intact
- [ ] win32.ps1 UTF-8 BOM 保持 / UTF-8 BOM preserved in win32.ps1
- [ ] 行为变化已记入 CHANGELOG/ Behavior changes recorded in CHANGELOG
- [ ] 无无关文件或本地伪影 / No unrelated files or local artifacts

## 基于版本 / Based on

<!-- 基于哪个基线开发:最近发布版本 / 最新 master / 具体 commit / Which baseline (e.g. latest release, latest master, specific commit) -->

## 关联(可选)/ Related (optional)

<!-- 仅本 PR 解决的 issue 用 Fixes/Closes/Resolves #N(合入默认分支时自动关闭)/ Only use Fixes/Closes/Resolves #N for issues this PR actually resolves -->
<!-- 非解决性事项用文字描述即可,不要引用 issue 编号 / For anything not resolved by this PR, describe it in text without referencing issue numbers -->

## 审查注意点 / Review Notes

<!-- reviewer 需特别关注的点 / Points the reviewer should pay special attention to -->
