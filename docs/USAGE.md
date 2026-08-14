<div align="right">

[English](USAGE.md) · [中文](USAGE-zh.md)

</div>

# Usage

## What gets notified

cc-notifier raises a toast (with sound) when Claude Code needs you and your session window is not focused:

| Event | Hook | Toast title | Toast body |
|---|---|---|---|
| Permission request | `PermissionRequest` | 权限请求 / Permission request | Tool + command/path (e.g. `Bash 请求执行:npm install` / `Bash requested to run: npm install`) |
| Question | `PreToolUse` (AskUserQuestion) | 提问 / Question | The question text |
| Tool error | `PostToolUse` | 工具出错 / Tool error | The error summary |
| Waiting for input | `Stop` | 等待输入 / Waiting for input | `Claude 等待输入` / `Claude is waiting for input` |

The toast language follows the Windows display language by default (`auto`) and can be overridden by the `language` config field (`zh`/`en`).

While the session window is focused, notifications are suppressed.

## Clicking a toast

Clicking a toast brings the session window back to the foreground. The window is resolved at SessionStart time by:

1. Process working directory (e.g. WindowsTerminal launched with `-d "<project path>"`)
2. The `?`-prefixed tab title (Claude Code's dynamic title)
3. Title containing the project name (fallback)

If the daemon is unavailable, notifications degrade to plain toasts without click-to-return.

## Manual triggering (testing)

Requires a running daemon (an active session). Switch focus away from the session window first — toasts are suppressed while focused.

```bash
node scripts/test.mjs permission-request
node scripts/test.mjs ask-user-question
node scripts/test.mjs tool-result
node scripts/test.mjs stop
node scripts/test.mjs session-start
```

## Project-level opt-out

Create `.claude/cc-notifier.json` in the project root:

```json
{ "enabled": false }
```

Precedence: project config > global `~/.cc-notifier/config.json` > defaults.

## Global configuration

`~/.cc-notifier/config.json`:

| Key | Default | Description |
|---|---|---|
| `enabled` | `true` | `false` disables notifications globally |
| `dedupWindowMs` | `10000` | Deduplication window for same-type events while unfocused (ms) |
| `sound` | `true` | `false` mutes toast sound |

## Multi-session behavior

Each session binds its own window handle at SessionStart. Toasts carry the project name, so notifications from parallel sessions are distinguishable. Same-type events from different sessions share a single 10-second dedup window.

## Notification history

Every notification is appended to `%LOCALAPPDATA%\cc-notifier\history.jsonl` (timestamp, project, title, body). Use it to review notifications you missed.
