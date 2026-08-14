## 1. 复现与改造

- [x] 1.1 复现:确认通知文案恒为中文且无语言输入(读 `events.mjs` TYPE_LABELS/模板 + `config.mjs` 无 language 字段;实测英文系统下 Toast 为中文)
- [x] 1.2 `config.mjs`:新增 `language` 配置(默认 auto)+ `detectSystemLanguage()`(reg query LocaleName,zh-*/en-* 映射,失败/其他回退 en)+ 解析逻辑
- [x] 1.3 `events.mjs`:TYPE_LABELS 双语表 + `summarize(lang, kind, payload)` 模板函数;`parseEvent(eventType, hookJson, lang)` 载荷携带 lang;`toastContent` 按语言取标签
- [x] 1.4 `notify-agent.mjs`:loadConfig 后把 `cfg.language` 传入 `parseEvent`
- [x] 1.5 测试:`test/events.test.mjs` 补 zh/en/回退断言;`test/config.test.mjs` 补 auto/zh/en/旧配置兼容断言(detectSystemLanguage mock,不真跑 reg)

## 2. 文档同步与验证

- [x] 2.1 文档:README(双版)/ docs/USAGE(双版)Toast 文案引用注明「标签随系统语言」;CHANGELOG(双版)Unreleased 条目;保持中英行数差 ≤10
- [x] 2.2 验证:新断言转绿 + 全量 `npm test` 通过;行数差 ≤10;pre-commit 双语镜像/BOM 通过

## 3. 复审调整(用户确认,verify-fail 回退)

- [x] 3.1 回退策略:`detectSystemLanguage` 失败/未知语言回退 `en`(原 zh;中文系统检测 zh-CN 不受影响);更新 `config.test.mjs` 断言
- [x] 3.2 Toast lang 属性:`toast-agent.py` 新增 `-Lang` 参数拼入 `<toast lang="...">`;`notify-agent.mjs` fallback 路径与 `daemon.mjs` 触发路径传递 `event.lang`
- [x] 3.3 CLI 输出双语:`install.mjs` / `uninstall.mjs` / `install-commit-hook.mjs` / `test.mjs` 的 console 输出改为中英双写(沿用 install-commit-hook 已有「双语镜像不对称 / asymmetry」先例)
- [x] 3.4 验证:全量 `npm test`(含新增断言)通过;pre-commit 全过

## 4. 独立审查修复(用户要求完整自检,verify-fail 回退)

- [x] 4.1 文档漂移:proposal.md / design.md 同步最终决策(回退 `en`、toast lang、CLI 双语、daemon/notify-agent 改动)
- [x] 4.2 注释矛盾:config.mjs 顶部 language 注释「未知语言回退 zh」→ `en`
- [x] 4.3 `toast-agent.py`:`lang_attr` 值经 `esc()` 转义
- [x] 4.4 `events.mjs`:tool-error 模板自包含(调用方传入截断后的 errText,移除 `||` 短路依赖)
- [x] 4.5 CLI 悬空冒号:`install.mjs` / `install-commit-hook.mjs` 英文半句补值(含 uninstall.mjs 同类行)
- [x] 4.6 性能:`notify-agent.mjs` 仅对 `NOTIFY_TYPES` 事件解析语言(消除 session-start/end 的 reg 开销)
- [x] 4.7 测试补强:`tool-run` zh/en 断言;`detectSystemLanguage` 失败/未知语言确定性断言(注入 exec 实现)
- [x] 4.8 验证:全量 `npm test` 通过;pre-commit 全过

## 5. 最终符合性审查修复(用户要求二次完整自检,verify-fail 回退)

- [x] 5.1 悬空冒号补完:`install.mjs` / `uninstall.mjs` 剩余 12 处英文半句并入值(含模板字符串 2 处);精确扫描无残留
- [x] 5.2 陈旧措辞:tasks.md 1.2、验证报告 §2「回退 zh」→ `en`(报告 45/46 行为历史记录,保留原样)
- [x] 5.3 测试补强:`language` 项目级覆盖断言(全局 zh + 项目 en → en;非法值回退 auto)
- [x] 5.4 验证:全量 `npm test` 通过;pre-commit 全过
