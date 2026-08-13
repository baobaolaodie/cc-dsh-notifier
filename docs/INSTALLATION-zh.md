<div align="right">

[English](INSTALLATION.md) · 中文

</div>

# 安装

cc-notifier 以 Claude Code hooks + 常驻 daemon 形式运行。零第三方 npm 依赖;运行时仅需 Node.js 与带 winrt 包的 Python。

## 安装前提

- Windows 10 或 11
- Node.js 18 及以上
- Python 3 及 winrt 包:
  ```
  pip install winrt-runtime winrt-Windows.UI.Notifications winrt-Windows.Data.Xml.Dom
  ```

## 安装

```bash
node scripts/install.mjs
```

安装器执行四步:

1. **注入 hooks** — 备份 `~/.claude/settings.json` 并添加六个 hooks(SessionStart、PermissionRequest、PreToolUse(AskUserQuestion matcher)、PostToolUse、Stop、SessionEnd)。幂等,重复执行安全。
2. **注册 AUMID** — 写入 `HKCU\Software\Classes\AppUserModelId\cc-notifier`(DisplayName + IconUri)。非打包应用显示 Toast 的前提。
3. **检测 Python** — 检查 `python` 与 winrt 包是否存在。缺失时仅提示,安装继续;Python 缺失时 Toast 静默失败。
4. **生成默认配置** — 若 `~/.cc-notifier/config.json` 不存在则写入。

## 验证

```bash
npm test
```

安装后新开 Claude Code 会话生效。SessionStart hook 会自动拉起 daemon。

## 卸载

```bash
node scripts/uninstall.mjs
```

移除注入的 hooks、恢复安装前 settings.json 备份、清理 AUMID 注册。daemon 在会话全部结束后自动退出。

## 安装 pre-commit 钩子(贡献者)

```bash
node scripts/install-commit-hook.mjs
```

每次提交前自动运行 `npm test`、双语镜像检查与 win32.ps1 BOM 防线。

## 运行时文件

运行时状态位于 `%LOCALAPPDATA%\cc-notifier\`:

| 文件 | 用途 |
|---|---|
| `daemon.json` | 常驻进程端口/pid(单实例握手) |
| `notify-agent.log`、`daemon.log`、`toast-click.log` | 运行日志(超 1 MB 自动截断) |
| `history.jsonl` | 本地通知历史 |
