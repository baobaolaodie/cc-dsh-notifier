<div align="right">

[English](CHANGELOG.md) · 中文

</div>

# 变更日志

本项目所有重要变更都会记录在此文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/);版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。版本记录于 git 标签与本文件。

## Unreleased

### 修复

- test 命令改为显式列出测试文件(替代 glob),修复 Node 18 Windows 上 `npm test` 失败(`Could not find 'test/*.test.mjs'`)。
- 通知文案按系统显示语言输出(`auto`),可由新配置项 `language`(`zh`/`en`)覆盖;英文系统用户收到英文通知。
- PR 模板与文档不再写死测试数量(`npm test` → 全部通过);模板复选框 label 不再与实际测试数脱节。

## [0.1.0] - 2026-08-14

首个发布:Claude Code 会话的 Windows 桌面通知系统。

### 新增

- 四类中断事件通知:权限请求、AskUserQuestion 提问、工具失败、Stop(等待输入)
- 聚焦感知:会话窗口聚焦时静默,失焦时才通知
- 原生 Windows Toast + 声音(Python winrt);点击跳转走进程内 `Activated` 回调与 `SetForegroundWindow`
- 多会话支持:每会话独立窗口绑定,Toast 携带项目名
- 去重:失焦时同类事件在 10 秒窗口内合并
- 降级:daemon 不可用时发基础 Toast(无跳转);任何环节失败不阻塞 Claude Code 会话
- 安装/卸载脚本:hooks 注入、AUMID 注册、settings 备份与恢复
- 项目级关闭:`.claude/cc-notifier.json`
- 全局配置:`enabled`、`dedupWindowMs`、`sound`
- 本地通知历史(`history.jsonl`)与轮转日志
- 45 条单元测试(`node:test`)

### 修复

- fallback Toast 不再阻塞 hook 最长 25 秒(fire-and-forget + `detached: true`)
- hook JSON 解析匹配真实扁平格式(`tool_name`/`tool_input`);保留嵌套 `tool_use` 兼容
- AskUserQuestion 提问提取真实 `question` 字段(原为 `prompt`)
- AskUserQuestion 同时触发 PreToolUse + PermissionRequest 双 hook 时的重复通知已消除
- SessionStart 窗口绑定排除非终端进程(如 explorer),通过进程工作目录与 `?` 前缀标题优先绑定 Claude Code 终端标签
- `normalizeCwd` 统一路径分隔符(`D:\foo` 与 `D:/foo` 等价)
