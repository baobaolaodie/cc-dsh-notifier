<div align="right">

[English](CHANGELOG.md) · [中文](CHANGELOG-zh.md)

</div>

# Changelog

All notable changes to this project are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/). Versions are recorded in git tags and this document.

## Unreleased

### Fixed

- Test command lists test files explicitly instead of a glob, fixing `npm test` on Node 18 Windows (`Could not find 'test/*.test.mjs'`).
- Toast text follows the Windows display language (`auto`) or a new `language` config field (`zh`/`en`); English users now get English notifications.

## [0.1.0] - 2026-08-14

Initial release: Windows desktop notifications for Claude Code sessions.

### Added

- Notification on four interruption events: permission requests, AskUserQuestion prompts, tool failures, and Stop (waiting for input)
- Focus awareness: suppresses notifications while the session window is focused
- Native Windows toasts with sound via Python winrt; click-to-return via in-process `Activated` callback and `SetForegroundWindow`
- Multi-session support: per-session window binding and project name in toasts
- Deduplication: same-type events merge within a 10-second window while unfocused
- Degradation: plain toast (no click-to-return) when the daemon is unavailable; hook execution never blocks the Claude Code session
- Install/uninstall scripts with hook injection, AUMID registration, and settings backup/restore
- Project-level opt-out via `.claude/cc-notifier.json`
- Global config: `enabled`, `dedupWindowMs`, `sound`
- Local notification history (`history.jsonl`) and rotating logs
- 45 unit tests (`node:test`)

### Fixed

- Fallback toast no longer blocks hooks for up to 25 seconds (fire-and-forget with `detached: true`)
- Hook JSON parsing now matches the real flat format (`tool_name`/`tool_input`); nested `tool_use` retained for compatibility
- AskUserQuestion prompt extraction uses the real `question` field (was `prompt`)
- Duplicate notifications suppressed when AskUserQuestion triggers both PreToolUse and PermissionRequest hooks
- SessionStart window binding excludes non-terminal processes (e.g. explorer) and prefers the Claude Code terminal tab via process working directory and `?`-prefixed title
- `normalizeCwd` unifies path separators (`D:\foo` and `D:/foo` are equivalent)
