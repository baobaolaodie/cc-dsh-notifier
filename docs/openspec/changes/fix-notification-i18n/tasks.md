## 1. 复现与改造

- [x] 1.1 复现:确认通知文案恒为中文且无语言输入(读 `events.mjs` TYPE_LABELS/模板 + `config.mjs` 无 language 字段;实测英文系统下 Toast 为中文)
- [x] 1.2 `config.mjs`:新增 `language` 配置(默认 auto)+ `detectSystemLanguage()`(reg query LocaleName,zh-*/en-* 映射,失败/其他回退 zh)+ 解析逻辑
- [x] 1.3 `events.mjs`:TYPE_LABELS 双语表 + `summarize(lang, kind, payload)` 模板函数;`parseEvent(eventType, hookJson, lang)` 载荷携带 lang;`toastContent` 按语言取标签
- [x] 1.4 `notify-agent.mjs`:loadConfig 后把 `cfg.language` 传入 `parseEvent`
- [x] 1.5 测试:`test/events.test.mjs` 补 zh/en/回退断言;`test/config.test.mjs` 补 auto/zh/en/旧配置兼容断言(detectSystemLanguage mock,不真跑 reg)

## 2. 文档同步与验证

- [x] 2.1 文档:README(双版)/ docs/USAGE(双版)Toast 文案引用注明「标签随系统语言」;CHANGELOG(双版)Unreleased 条目;保持中英行数差 ≤10
- [x] 2.2 验证:新断言转绿 + 全量 `npm test` 通过;行数差 ≤10;pre-commit 双语镜像/BOM 通过
