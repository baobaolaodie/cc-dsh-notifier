## Why

通知文案 **100% 硬编码中文**,与使用者语言完全无关:

- `events.mjs` `TYPE_LABELS`(第 10-13 行):Toast 标题「权限请求 / 提问 / 工具出错 / 等待输入」写死中文
- `events.mjs` `parseEvent` 的 summary 模板(第 60-87 行):「Bash 请求执行: / 请求访问: / 请求执行 / 工具执行出错 / Claude 等待输入」写死中文
- 无 `language` 配置项(`config.mjs` `DEFAULT_CONFIG` 只有 enabled/dedupWindowMs/sound),无系统语言检测

英文 Windows 用户收到的每条 Toast 都是中文;项目 README 以英文为主、面向全球用户,通知本体却只有中文——行为与产品身份不符。

## 根因

事件解析层(`events.mjs`)把用户可见文案常量直接写死在中文;配置层从未提供语言维度;系统显示语言从未被读取。

## What Changes

- `config.mjs`:`DEFAULT_CONFIG` 新增 `language` 字段(`'auto' | 'zh' | 'en'`,默认 `auto`);新增 `detectSystemLanguage()`:auto 时读取 Windows 显示语言(`reg query HKCU\Control Panel\International /v LocaleName`,`zh-*` → zh,`en-*` → en,检测失败/其他语言 → 回退 en,项目英文主版;中文系统检测 zh-CN 不受影响)
- `events.mjs`:`TYPE_LABELS` 改为双语表(zh/en,zh 文案与旧行为逐字一致);summary 拼接模板化,`parseEvent(eventType, hookJson, lang)` 按语言生成文案;`toastContent` 按事件携带的语言取标签
- `notify-agent.mjs`:loadConfig 后把语言传入 `parseEvent`(仅 NOTIFY_TYPES 事件解析,省去 session-start/end 的 reg 检测开销);fallback 路径传递 `-Lang`
- `daemon.mjs`:Toast 触发路径传递 `-Lang`
- `toast-agent.py`:新增 `-Lang` 参数,拼入 `<toast lang="...">`(未传则不输出)
- CLI 双语:`install.mjs` / `uninstall.mjs` / `install-commit-hook.mjs` / `test.mjs` 的 console 输出中英双写
- 测试:`test/events.test.mjs`、`test/config.test.mjs` 补语言相关断言(zh/en 文案、auto 检测、注入式回退验证、旧配置兼容)
- 文档:README / docs/USAGE 表格中 Toast 文案引用注明「标签随系统语言」;CHANGELOG(双语)加 Unreleased 条目

**范围边界**(不在本 change,验证报告中记录 SUGGESTION):内部日志(daemon.log 等)仍为中文,不面向用户,留待后续。

## Capabilities

### New Capabilities

无新增 capability 声明(本 change 定位为既有 4 类通知的文案缺陷修复;但按 hotfix 升级判定,config 新增 `language` 字段属配置 schema 增量,见 design.md 说明,由用户决策是否升级 full)。

### Modified Capabilities

无 delta spec:既有 spec 10 条需求的验收场景不含文案语言,4 类通知行为不变,仅文案来源改变。

## Impact

- `scripts/lib/config.mjs`:默认配置新增字段(向后兼容,旧配置文件无该字段 → 默认 auto);`detectSystemLanguage(execImpl)` 支持注入(测试用)
- `scripts/lib/events.mjs`:文案结构改为双语表 + 模板函数;`parseEvent` 签名追加 `lang` 参数(内部调用方仅 notify-agent.mjs,测试同步更新)
- `scripts/notify-agent.mjs`:解析语言并传入 `parseEvent`;fallback 路径传递 `-Lang`
- `scripts/daemon.mjs`:Toast 触发路径传递 `-Lang`
- `scripts/toast-agent.py`:`-Lang` 参数 → `<toast lang="...">`(值经 esc 转义)
- CLI 脚本:`install.mjs` / `uninstall.mjs` / `install-commit-hook.mjs` / `test.mjs` console 输出双语
- 测试文件:`test/events.test.mjs`、`test/config.test.mjs`
- 文档:README.md / README-zh.md / docs/USAGE.md / docs/USAGE-zh.md / CHANGELOG 双语
