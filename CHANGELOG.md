<div align="right">

[English](CHANGELOG.md) · [中文](CHANGELOG-zh.md)

</div>

# Changelog

All notable changes to this project are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/). Versions are recorded in git tags and this document.

## Unreleased

### Added

- DeepSeek Harness (dsh) support: a `dsh-notifier` bundle plugin (web + tui profiles) forwards dsh session events into the existing cc-dsh-notifier pipeline — permission requests, questions, and waiting-for-input all surface as Windows toasts with click-to-jump; daemon lifecycle is fully automatic (spawn on any event, idle/host-liveness exit, self-restart on code change, session re-registration on daemon restart).
- Config fields `dedupWindowMs` (default `0` = no dedup), `pythonPath` (toast interpreter, written by the installer), `pollIntervalMs` (daemon window-poll period, default `10000`). Waiting-for-input suppression was removed: focus detection alone decides whether to notify.
- Per-source toast icons: black whale (transparent) for dsh, official Claude Code starburst for Claude Code.
- Precompiled helpers `foreground.exe` (real-time foreground query, ~150 ms) and `activate-tab.exe` (UIA tab activation) with source checked in.
- dsh ecosystem discovery: the repository root declares a `dsh.bundle` patch and `main` entry, so git installs (`dsh plugin add github:baobaolaodie/cc-dsh-notifier`) and the awesome-dsh-plugins radar recognize it; the vendored runtime is tracked in git and kept in sync by the `prepare`/`pretest` vendor script; git installs verified end to end (package-name patch resolution, module load).
- **Rename to cc-dsh-notifier**: the project now serves both Claude Code and DeepSeek Harness; repository, root and plugin package names, bundle patch entry names, and docs are renamed (runtime identifiers — `%LOCALAPPDATA%\cc-notifier` data dir, `AppUserModelId\cc-notifier` AUMID, `.claude/cc-notifier.json` — stay for backward compatibility).
- Non-Windows platforms load the plugin in degraded mode with an explicit log line (toasts require Windows; headless/radar environments stay functional).

### Fixed

- Tool-error notifications removed (user decision): a failed tool call does not stop the agent, so notifying on it only added noise. `tool-result` dropped from the notify types (Claude Code PostToolUse hook no longer injected; dsh `tool/result` no longer mapped).
- Claude Code sessions in a standalone Windows Terminal (no `-d` argument, title without project name) now bind via the `?`-prefixed dynamic title — matched globally but scoped to Claude Code events so dsh-tui sessions cannot be bound to a Claude Code window.
- Existing Claude Code sessions that never re-fire `session-start` get a lazy binding fallback: unbound claude-surface toasts pick the latest `?`-tagged terminal window as the jump target, so click-to-return works without restarting the session.
- Plugin published to GitHub Packages as `@baobaolaodie/cc-dsh-notifier` (public); tarball and git installs keep working (root patch stays `cc-dsh-notifier`, matching the git-install dependency name).
- Bundle patch entry name quoted (`"@baobaolaodie/cc-dsh-notifier"`): a bare `@` prefix is a reserved YAML indicator and broke profile config parsing (0.1.3); 0.1.4 fixes it.
- Test command lists test files explicitly instead of a glob, fixing `npm test` on Node 18 Windows (`Could not find 'test/*.test.mjs'`).
- Toast text follows the Windows display language (`auto`) or a new `language` config field (`zh`/`en`); English users now get English notifications.
- PR template and docs no longer pin the test count (`npm test` → all pass); the PR template checkbox label no longer drifts out of sync with the actual test suite.
- Comet artifacts (`.comet/`, `docs/openspec/`, `docs/superpowers/`) are no longer version-controlled; they remain on disk as local process artifacts.
- Toasts no longer crash when the host environment resolves a different `python` (missing `winrt`): the installer records the interpreter's absolute path in `pythonPath`.
- Focus detection uses a real-time foreground query instead of a stale poll cache, eliminating toasts suppressed while the user has already switched away (and the opposite race).
- Windows Toast jump now activates a DeepSeek Harness browser tab via UIA (candidate matching: session title, then product name).

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
