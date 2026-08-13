<div align="right">

[English](INSTALLATION.md) · [中文](INSTALLATION-zh.md)

</div>

# Installation

cc-notifier runs as Claude Code hooks plus a resident daemon. There are no third-party npm dependencies; the only runtime requirements are Node.js and Python with the winrt packages.

## Prerequisites

- Windows 10 or 11
- Node.js 18 or later
- Python 3 with the winrt packages:
  ```
  pip install winrt-runtime winrt-Windows.UI.Notifications winrt-Windows.Data.Xml.Dom
  ```

## Install

```bash
node scripts/install.mjs
```

The installer performs four steps:

1. **Hook injection** — backs up `~/.claude/settings.json` and adds six hooks (SessionStart, PermissionRequest, PreToolUse with the AskUserQuestion matcher, PostToolUse, Stop, SessionEnd). Idempotent: re-running is safe.
2. **AUMID registration** — writes `HKCU\Software\Classes\AppUserModelId\cc-notifier` (DisplayName + IconUri). Required for Windows to display toasts from a non-packaged app.
3. **Python detection** — checks that `python` and the winrt packages exist. Warnings are printed but installation proceeds; toasts will fail silently if Python is missing.
4. **Default config** — writes `~/.cc-notifier/config.json` if absent.

## Verify

```bash
npm test
```

Open a new Claude Code session after install. The SessionStart hook starts the daemon automatically.

## Uninstall

```bash
node scripts/uninstall.mjs
```

Removes the injected hooks, restores the pre-install backup of `settings.json`, and clears the AUMID registration. The daemon exits on its own once sessions close.

## Install the pre-commit hook (contributors)

```bash
node scripts/install-commit-hook.mjs
```

Runs `npm test`, bilingual-mirror checks, and the win32.ps1 BOM guard before every commit.

## Runtime files

All runtime state lives under `%LOCALAPPDATA%\cc-notifier\`:

| File | Purpose |
|---|---|
| `daemon.json` | Resident process port/pid (single-instance handshake) |
| `notify-agent.log`, `daemon.log`, `toast-click.log` | Run logs (truncated above 1 MB) |
| `history.jsonl` | Local notification history |
