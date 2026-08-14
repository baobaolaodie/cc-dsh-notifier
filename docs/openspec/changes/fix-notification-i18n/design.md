# 修复方案

单一方案(不做多方案对比):**双语文案表 + 配置驱动语言 + 系统语言检测**。

## 语言解析(新增,`config.mjs`)

- `DEFAULT_CONFIG` 增加 `language: 'auto'`
- `loadConfig` 返回后解析语言:`language` ∈ `'auto' | 'zh' | 'en'`;`auto` → `detectSystemLanguage()`
- `detectSystemLanguage()`:spawn `reg query "HKCU\Control Panel\International" /v LocaleName`,解析值(`zh-CN` → `zh`,`en-US` → `en`);查询失败、输出不可解析或其他语言 → **回退 `zh`**(与现状一致,不惊扰既有中文用户;不引入第三种语言)
- 兼容性:旧配置文件无 `language` 字段 → 默认 auto → 检测;中文系统行为不变

## 文案结构(改造,`events.mjs`)

```js
export const TYPE_LABELS = {
  zh: { 'permission-request': '权限请求', 'ask-user-question': '提问', 'tool-result': '工具出错', stop: '等待输入' },
  en: { 'permission-request': 'Permission request', 'ask-user-question': 'Question', 'tool-result': 'Tool error', stop: 'Waiting for input' },
};
```

- summary 模板函数化:`summarize(lang, kind, payload)`,覆盖 5 个模板:
  - bash-request(command)/ tool-file(file_path)/ tool-run(toolName)/ tool-error(errText)/ stop
  - `zh` 文案与现状逐字一致(保证中文用户零感知)
  - `en` 文案:`Bash requested to run: <cmd>` / `<tool> requests access to: <file>` / `<tool> requested to run` / 错误原文透传 + `Tool execution failed` / `Claude is waiting for input`
- `parseEvent(eventType, hookJson, lang = 'zh')`:事件载荷新增 `lang` 字段,summary 按语言生成
- `toastContent(event)`:标签从 `TYPE_LABELS[event.lang]` 取,缺语言回退 zh

## 链路改动(最小侵入)

- `notify-agent.mjs`:`parseEvent(eventType, hookJson, cfg.language)`(1 处)
- `daemon.mjs` / `toast-agent.py`:**不改**(事件透传,标题/正文已按语言生成;Toast XML 的 `lang` 属性列为 SUGGESTION,不阻塞本 change)

## 测试

- `test/events.test.mjs`:新增「en 标签与 en summary」「lang 缺省回退 zh」「zh 文案与现状一致」断言
- `test/config.test.mjs`:新增「language=auto 解析」「language=zh/en 直取」「旧配置无 language 字段 → auto 默认」断言(detectSystemLanguage 的 reg 调用注入 mock,不真跑 reg)
