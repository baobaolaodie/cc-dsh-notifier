<div align="right">

[English](USAGE.md) · [中文](USAGE-zh.md)

</div>

# Usage

## What gets notified

cc-notifier raises a toast (with sound) when Claude Code or DeepSeek Harness needs you and the session window is not focused:

| Event | Source | Toast title | Toast body |
|---|---|---|---|
| Permission request | Claude: `PermissionRequest`; dsh: `approval/asked` | 权限请求 / Permission request | Tool + reason (e.g. `Bash 请求执行:npm install` / `Bash requested to run: npm install`) |
| Question | Claude: `PreToolUse` (AskUserQuestion); dsh: `tool/call` | 提问 / Question | The question text |
| Tool error | Claude: `PostToolUse`; dsh: `tool/result` (isError) | 工具出错 / Tool error | The error summary |
| Waiting for input | Claude: `Stop`; dsh: `agent/status` idle | 等待输入 / Waiting for input | `Claude 等待输入` / `DeepSeek Harness 等待输入` |

The toast language follows the Windows display language by default (`auto`) and can be overridden by the `language` config field (`zh`/`en`).

While the session window is focused, notifications are suppressed. Focus is checked at event arrival time (real-time foreground query), so switching away takes effect immediately.

## Clicking a toast

Clicking a toast brings the session window back to the foreground.

- **Claude Code / dsh tui** — the terminal window bound at SessionStart, resolved by process working directory, the `?`-prefixed tab title, or the project name in the title.
- **dsh web** — the browser window is brought forward and the DeepSeek Harness tab is activated via UIA (candidate match: session title, then product name).

If the daemon is unavailable, notifications degrade to plain toasts without click-to-return.

## DeepSeek Harness (dsh)

The `dsh-notifier` plugin forwards dsh session events into the same pipeline. Both profiles share one install; the surface is detected from the profile name in the process arguments.

- **web profile** — events bind to the browser window; toasts are silenced while any DeepSeek Harness tab is the active tab of the foreground browser window.
- **dsh-tui profile** — events bind to the terminal window.

The daemon lifecycle is automatic: any notification event wakes it, it exits 60 seconds after the last session closes, host exit is detected via `hostPid` within about 90 seconds, and sessions re-register automatically after a daemon restart. Editing the daemon code restarts it within 10 seconds.

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
| `dedupWindowMs` | `0` | Deduplication window (ms); `0` = no dedup; `>0` merges per session+type |
| `stopSuppressMs` | `15000` | Window after a user interaction during which entering waiting-for-input stays silent |
| `pythonPath` | empty | Absolute path of the toast interpreter (written by the installer) |
| `pollIntervalMs` | `10000` | Daemon window-poll period (ms) |
| `windowWhitelist` | `[]` | Browser process whitelist for dsh web binding/focus |
| `sound` | `true` | `false` mutes toast sound |
| `language` | `auto` | Toast language: `auto`, `zh`, or `en` |

## Multi-session behavior

Each session binds its own window handle at SessionStart. Toasts carry the session identity, so notifications from parallel sessions are distinguishable. Deduplication is off by default — concurrent sessions never swallow each other's notifications; when enabled, merging is scoped per session and type.

## Notification history

Every notification is appended to `%LOCALAPPDATA%\cc-notifier\history.jsonl` (timestamp, project, title, body). Use it to review notifications you missed.
