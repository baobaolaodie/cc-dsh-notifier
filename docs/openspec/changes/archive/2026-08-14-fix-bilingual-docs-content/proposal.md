## Why

`CONTRIBUTING.md` 与 `SECURITY.md` 是仓库的**英文主版**(README 英文为主、语言切换链接标 "English"),但正文实际是中文:前者从「感谢你考虑为 cc-notifier 贡献代码」起全中文,后者从「请勿在公开 issue 中披露安全漏洞」起全中文。GitHub 上的英文读者(潜在贡献者、安全研究者)看到的是中文内容,尤其 SECURITY 的漏洞报告指引对英文用户不可读——这违背了仓库双语文档镜像的承诺(README/CONTRIBUTING/SECURITY/CHANGELOG/docs 三册,中英双语)。

已排查其余英文文档(`README.md`/`docs/USAGE.md` 表格中的「权限请求/提问/工具出错」等为 Toast 实际显示的 UI 文案,`CODE_OF_CONDUCT.md`/`CHANGELOG.md`/`docs/INSTALLATION.md` 仅含语言切换链接,`docs/TROUBLESHOOTING.md` 含一条引用中文 daemon 日志的示例)——均属有意保留,无同类错位。

## 根因

编写英文文档时正文直接以中文撰写(疑似从 -zh.md 复制后未翻译)。CI 双语镜像检查(`.github/workflows/ci.yml` quality job)只校验两件事:①成对文件必须都存在;②中英行数差 ≤10——**完全不校验语言内容**。英文文件写成中文后行数与中文版接近,CI 照常放行。

## What Changes

- `CONTRIBUTING.md`:以 `CONTRIBUTING-zh.md` 为内容底稿,正文全部重写为英文(保留标题、章节结构、代码块与语言切换链接)
- `SECURITY.md`:以 `SECURITY-zh.md` 为内容底稿,正文全部重写为英文(保留表格与语言切换链接)

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无(文档内容修复,不涉及运行时行为,spec 验收场景不变,无需 delta spec)。

## Impact

- `CONTRIBUTING.md`、`SECURITY.md`:内容由中文改为英文,行数接近对应 -zh.md(保持 CI 行数差 ≤10)
- 其他文件不受影响
