<div align="right">

[English](TROUBLESHOOTING.md) · 中文

</div>

# 故障排查

## 无通知出现

按顺序检查:

1. **安装后是否新开了会话** — hooks 在会话启动时读取。`install.mjs` 后需新开 Claude Code 会话。
2. **`enabled` 是否为 `false`** — 检查 `~/.cc-notifier/config.json` 与项目级 `.claude/cc-notifier.json`。
3. **窗口是否失焦** — 会话窗口聚焦时静默(设计如此)。
4. **AUMID 是否注册** — 重跑 `node scripts/install.mjs`;验证:
   ```
   reg query HKCU\Software\Classes\AppUserModelId\cc-notifier
   ```
5. **Python + winrt 是否存在** — `python -c "import winrt.windows.ui.notifications"` 必须成功。
6. **daemon 是否运行** — `%LOCALAPPDATA%\cc-notifier\daemon.json` 存在且 pid 存活。查看 `daemon.log`。

## Toast 显示但点击不跳转

- 通知时 daemon 不可用(降级 Toast,设计上无跳转)。查看 `notify-agent.log` 中的 `fallback toast`。
- SessionStart 时窗口句柄绑定失败:终端标题不含项目名且进程工作目录不匹配。查看 `daemon.log` 中 `session-start 绑定窗口 hwnd=0`。
- 终端多标签时绑定了错误标签——`?` 前缀标签(Claude Code 动态标题)优先。

## 事件触发了但 Toast 从未出现

- **Windows Terminal 多标签**:Toast 属于系统而非终端;若 Toast 显示在其他虚拟桌面或被专注助手隐藏,可能不可见。
- **专注助手(勿扰模式)** 可能抑制 Toast。检查 Windows 设置 → 系统 → 专注助手。
- 查看 `toast-click.log` — 若出现 `shown, waiting for click...`,说明 Toast 已显示。

## hooks 未触发

- 检查 `~/.claude/settings.json` 的 hooks 条目;其他工具可能覆盖了它们。重跑 `node scripts/install.mjs`。
- `PreToolUse` hook 使用 `AskUserQuestion` matcher;确认它在 settings 合并后仍存在。

## 日志为空

- 日志位于 `%LOCALAPPDATA%\cc-notifier\`(`notify-agent.log`、`daemon.log`、`toast-click.log`),超 1 MB 自动截断。`toast-click.log` 由 `toast-agent.py` 写入。
- 若日志文件完全不存在,说明脚本可能未运行(hooks 未安装)——重新安装。

## 通知内容为空

- 真实 hook JSON 是扁平格式(`tool_name`/`tool_input`)。若看到空 Toast,通过调试 hook 检查载荷:`ask-user-question` 的字段是 `questions[0].question`(非 `prompt`)。

## Toast 语言不符合预期

- Toast 文案默认跟随系统显示语言(`language: auto`)。可在 `~/.cc-notifier/config.json`(或项目级 `.claude/cc-notifier.json`)将 `language` 设为 `zh` 或 `en` 覆盖。
- `auto` 将 `zh-*` 区域映射为中文、`en-*` 映射为英文;其他区域或检测失败回退英文。
