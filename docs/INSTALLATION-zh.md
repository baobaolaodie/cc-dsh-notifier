<div align="right">

[English](INSTALLATION.md) · 中文

</div>

# 安装

cc-dsh-notifier 以 Claude Code hooks + 常驻 daemon 形式运行。零第三方 npm 依赖;运行时仅需 Node.js 与带 winrt 包的 Python。

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
2. **注册 AUMID** — 写入 `HKCU\Software\Classes\AppUserModelId\cc-dsh-notifier`(DisplayName + IconUri)。非打包应用显示 Toast 的前提。
3. **检测 Python** — 把 `python` 解析为绝对路径并写入配置 `pythonPath`,再检查 winrt 包。固定路径保证 Toast 不受宿主 PATH 变化影响。缺失时仅提示,安装继续;Python 缺失时 Toast 静默失败。
4. **生成默认配置** — 若 `~/.cc-notifier/config.json` 不存在则写入。

## 安装 DeepSeek Harness(dsh)支持

dsh 侧与 Claude Code 完全独立安装:插件只碰 dsh profile,hooks 安装只碰 `~/.claude/settings.json`。

```bash
# 仓库根目录执行;务必使用相对路径
dsh plugin --profile web add ./plugins/dsh-notifier
dsh plugin --profile dsh-tui add ./plugins/dsh-notifier
```

`dsh plugin add` 会因 `dsh.bundle` 声明自动把插件并入 `dsh.profile.bundles`。Windows 上 profile 与仓库跨盘时,pnpm `link:` junction 会被建坏(workspace + 跨盘缺陷);修复后重新触发 reconcile:

```bash
# 跨盘 junction 缺陷的一次性修复
rmdir %USERPROFILE%\.dsh\profiles\web\node_modules\dsh-notifier
mklink /J %USERPROFILE%\.dsh\profiles\web\node_modules\dsh-notifier D:\path\to\repo\plugins\dsh-notifier
dsh plugin --profile web list   # 只读 pnpm 命令触发 reconcile
```

验证 profile 层后重启 profile:

```bash
dsh --profile web --dump-config   # 应出现 "# == dsh-notifier" 层
```

打包为 tarball(`pnpm pack`)或发布 registry 后安装无需修复步骤。

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
