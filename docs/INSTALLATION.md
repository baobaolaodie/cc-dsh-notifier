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
3. **Python detection** — resolves `python` to its absolute path and writes it as `pythonPath` in the config, then checks the winrt packages. The fixed path keeps toasts working regardless of the host's PATH. Warnings are printed but installation proceeds; toasts will fail silently if Python is missing.
4. **Default config** — writes `~/.cc-notifier/config.json` if absent.

## Install for DeepSeek Harness (dsh)

The dsh side installs independently of Claude Code: the plugin only touches the dsh profiles, the hooks install only touches `~/.claude/settings.json`.

```bash
# from the repository root; relative paths only
dsh plugin --profile web add ./plugins/dsh-notifier
dsh plugin --profile dsh-tui add ./plugins/dsh-notifier
```

`dsh plugin add` reconciles the `dsh.bundle` declaration into `dsh.profile.bundles` automatically. On Windows with the profile on a different drive than the repository, the pnpm `link:` junction is created broken (workspace + cross-drive); repair it and re-trigger the reconcile:

```bash
# one-time repair for the cross-drive junction defect
rmdir %USERPROFILE%\.dsh\profiles\web\node_modules\dsh-notifier
mklink /J %USERPROFILE%\.dsh\profiles\web\node_modules\dsh-notifier D:\path\to\repo\plugins\dsh-notifier
dsh plugin --profile web list   # read-only pnpm command triggers the reconcile
```

Verify the profile layer, then restart the profile:

```bash
dsh --profile web --dump-config   # expect a "# == dsh-notifier" layer
```

A packaged tarball (`pnpm pack`) or a registry release installs without the repair step.

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
