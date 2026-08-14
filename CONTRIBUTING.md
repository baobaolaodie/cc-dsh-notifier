<div align="right">

English · [中文](CONTRIBUTING-zh.md)

</div>

# Contributing to cc-notifier

Thank you for considering contributing to cc-notifier. This page describes the development workflow and conventions.

## Development environment

- Windows 10/11
- Node.js 18+
- Python 3 + winrt packages: `pip install winrt-runtime winrt-Windows.UI.Notifications winrt-Windows.Data.Xml.Dom`
- Optional: a running Claude Code session (for manual trigger testing)

## Running tests

```bash
npm test                    # all unit tests (45 assertions, node:test)
node --test test/events.test.mjs   # single test file
node scripts/test.mjs <event> # manual trigger through the real pipeline (permission-request|ask-user-question|tool-result|stop|session-start)
```

Manual trigger notes: a running daemon is required (an active session); toasts are suppressed while the session window is focused (focus silence) — switch focus away to observe.

## Change workflow

This project uses the Comet Classic workflow to manage changes. Before starting any change:

1. Run `comet resume-probe . --stdin --json` to check for an active change
2. With no active change, create one via `/comet-classic` (full workflow) or `/comet-hotfix` (bugfix preset)
3. Write operations are guarded by the Comet hook guard: without an active change, Write/Edit are blocked — go through the Comet workflow first

Prefer the hotfix preset for bugfixes (open → build → verify → archive); use the full workflow for new capabilities.

## Code conventions

- Zero third-party npm dependencies is a hard constraint — new features must not introduce npm packages
- `parseEvent` in `events.mjs` must support both the real hook JSON flat format (`tool_name`/`tool_input`) and the nested `tool_use` fallback; the AskUserQuestion field is `questions[0].question`
- `win32.ps1` must keep its UTF-8 BOM (PS 5.1 relies on it to decode Chinese comments)
- New logic requires accompanying unit tests (`test/*.test.mjs`, node:test)

## Commit conventions

- Commit messages follow Conventional Commits: `fix:` / `feat:` / `docs:` / `chore:` prefixes
- Each Comet change is committed automatically by the workflow when complete; do not mix in unrelated changes

## Submission workflow

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/your-change`)
3. Commit your changes (`git commit -m 'fix: describe the change'`)
4. Push the branch (`git push origin feature/your-change`)
5. Open a Pull Request
