<div align="right">

English · [中文](SECURITY-zh.md)

</div>

# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ |

## Reporting a Vulnerability

Do not disclose security vulnerabilities in public issues. Please report privately through:

- Open an issue and tag it `security`, describing the problem without exploit details
- Or describe the fix in a PR (without vulnerability details)

Project maintainers respond within 48 hours.

## Security design notes

- Zero third-party npm dependencies; the attack surface is limited to the local machine
- No failure in the notification pipeline blocks the Claude Code session
- Runtime data (logs, history) is stored only in `%LOCALAPPDATA%\cc-notifier\`, never transmitted across processes or network
- The local HTTP IPC listens only on 127.0.0.1 on a random port, not reachable externally
