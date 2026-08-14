# 修复方案

单一方案(不做多方案对比):**双语文案表 + 配置驱动语言 + 系统语言检测**。

## 语言解析(新增,`config.mjs`)

- `DEFAULT_CONFIG` 增加 `language: 'auto'`
- `loadConfig` 返回后解析语言:`language` ∈ `'auto' | 'zh' | 'en'`;`auto` → `detectSystemLanguage()`
- `detectSystemLanguage(execImpl)`(exec 可注入,测试用):spawn `reg query "HKCU\Control Panel\International" /v LocaleName`,解析值(`zh-CN` → `zh`,`en-US` → `en`);查询失败、输出不可解析或其他语言 → **回退 `en`**(项目英文主版;中文系统检测 zh-CN 仍得 zh,不受影响)
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

- `notify-agent.mjs`:语言先于 `parseEvent` 解析(`parseEvent(eventType, hookJson, lang)`),仅 `NOTIFY_TYPES` 事件解析(省去 session-start/end 的 reg 开销);fallback 路径传递 `-Lang`
- `daemon.mjs`:Toast 触发路径传递 `-Lang`(事件透传,标题/正文已按语言生成)
- `toast-agent.py`:新增 `-Lang` 参数(小写比较解析),拼入 `<toast lang="...">`(未传则不输出;值经 `esc()` 转义)
- CLI 输出:`install.mjs` / `uninstall.mjs` / `install-commit-hook.mjs` / `test.mjs` console 输出中英双写(沿用 install-commit-hook 已有「双语镜像不对称 / asymmetry」先例,不引入语言检测)

## 测试

- `test/events.test.mjs`:新增「en 标签与 en summary(四类事件)」「lang 缺省回退 zh」「zh 文案与现状逐字一致」「tool-run 模板」「错误原文透传」断言
- `test/config.test.mjs`:新增「language=auto 解析」「language=zh/en 直取」「旧配置无 language 字段 → auto 默认」断言;`detectSystemLanguage` 注入 exec 确定性验证(失败/未知/空输出 → en,zh-CN → zh)
