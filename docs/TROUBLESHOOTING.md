<div align="right">

[English](TROUBLESHOOTING.md) · [中文](TROUBLESHOOTING-zh.md)

</div>

# Troubleshooting

## No notification appears

Check in order:

1. **Installed after opening the session** — hooks are read at session start. Open a new session after `install.mjs`.
2. **`enabled` is not `false`** — check `~/.cc-notifier/config.json` and any project-level `.claude/cc-notifier.json`.
3. **Window is unfocused** — notifications are suppressed while the session window is focused (by design). For dsh web, suppression is decided by the foreground browser tab's title: any tab showing a DeepSeek Harness page silences, any other site notifies.
4. **AUMID registered** — re-run `node scripts/install.mjs`; verify with:
   ```
   reg query HKCU\Software\Classes\AppUserModelId\cc-notifier
   ```
5. **Python + winrt present** — `python -c "import winrt.windows.ui.notifications"` must succeed. If the daemon's toast exits with code 1 (`toast stderr ... No module named 'winrt'` in `daemon.log`), the host resolved a different interpreter: set `pythonPath` to the interpreter that has winrt installed (re-run `install.mjs` to write it automatically).
6. **Daemon running** — `%LOCALAPPDATA%\cc-notifier\daemon.json` exists and the pid is alive. Check `daemon.log`. The daemon wakes on any notification event, so a missing daemon is usually transient; if it stays absent, check the host's plugin layer.
7. **dsh plugin loaded** — `dsh --profile <name> --dump-config` must show a `# == @baobaolaodie/cc-dsh-notifier` layer; `daemon.log` shows `event session-start ... surface=web|tui` when it is.

## Toast shows but click does not return to the session

- The daemon was unavailable at notification time (degraded toast, no click-to-return by design). Check `notify-agent.log` for `fallback toast`.
- The window handle could not be bound at SessionStart: the terminal title carries no project name and the process working directory did not match. Check `daemon.log` for a `toast hwnd=0` line for that session (the handle was never bound).
- The terminal has multiple tabs and the wrong tab was bound — the `?`-prefixed tab (Claude Code's dynamic title) is preferred.

## Toast never appears even though the event fires

- **Windows Terminal multi-tab**: toasts belong to the system, not the terminal; if a toast is shown on another virtual desktop or is hidden by focus-assist, it may not be visible.
- **Focus Assist (Quiet Hours)** can suppress toasts. Check Windows Settings → System → Focus assist.
- Check `toast-click.log` — if `shown, waiting for click...` appears, the toast was displayed.

## Hooks not firing

- Check `~/.claude/settings.json` hooks entries; another tool may have overwritten them. Re-run `node scripts/install.mjs`.
- The `PreToolUse` hook uses the `AskUserQuestion` matcher; confirm it survived any settings merge.

## dsh plugin installed but no layer

- The profile's `node_modules/@baobaolaodie/cc-dsh-notifier` junction may be broken (pnpm workspace + cross-drive defect): the link target looks like `...\profiles\web\D:\...`. Repair it and re-trigger the reconcile — see [INSTALLATION.md](INSTALLATION.md).
- A packaged tarball or registry install avoids the repair step entirely.

## Logs show nothing

- Logs live in `%LOCALAPPDATA%\cc-notifier\` (`notify-agent.log`, `daemon.log`, `toast-click.log`), truncated above 1 MB. The `toast-click.log` is written by `toast-agent.py`.
- If log files are absent entirely, the scripts may not have run (hooks not installed) — re-install.

## Notification content is empty

- Real hook JSON uses the flat format (`tool_name`/`tool_input`). If you see empty toasts, check the hook payload via a debug hook: the `ask-user-question` field is `questions[0].question` (not `prompt`).

## Toast language is not what I expect

- Toast text follows the Windows display language by default (`language: auto`). Override by setting `language` to `zh` or `en` in `~/.cc-notifier/config.json` (or the project-level `.claude/cc-notifier.json`).
- `auto` maps `zh-*` locales to Chinese and `en-*` to English; any other locale or a failed detection falls back to English.
