<div align="right">

[English](CHANGELOG.md) · 中文

</div>

# 变更日志

本项目所有重要变更都会记录在此文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/);版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。版本记录于 git 标签与本文件。

## Unreleased

### 新增

- DeepSeek Harness(dsh)支持:`dsh-notifier` 组合包插件(web + tui profile)把 dsh 会话事件接入现有 cc-dsh-notifier 管线 —— 权限请求、提问、等待输入全部以 Windows Toast 呈现并支持点击跳转;daemon 生命周期全自动(任何事件拉起、空闲/宿主存活退出、代码变更自我重启、daemon 重启后会话重注册)。
- 新配置项 `dedupWindowMs`(默认 `0` = 不去重)、`pythonPath`(Toast 解释器,安装时写入)、`pollIntervalMs`(daemon 窗口轮询周期,默认 `10000`)。移除等待输入交互抑制:是否通知完全由聚焦判定决定。
- 按来源区分的 Toast 图标:dsh 用黑鲸鱼(透明底),Claude Code 用官方星形 logo。
- 预编译助手 `foreground.exe`(实时前台查询,~150ms)与 `activate-tab.exe`(UIA tab 激活),源码入库。
- dsh 生态发现:仓库根声明 `dsh.bundle` patch 与 `main` 入口,git 安装(`dsh plugin add github:baobaolaodie/cc-dsh-notifier`)与 awesome-dsh-plugins 雷达可识别;vendor runtime 入库并由 `prepare`/`pretest` 保持同步;git 安装已端到端验证(包名 patch 解析、模块加载)。
- **更名为 cc-dsh-notifier**:项目现同时服务 Claude Code 与 DeepSeek Harness;仓库、根/插件包名、bundle patch 条目名与文档同步改名(运行时标识 —— `%LOCALAPPDATA%\cc-notifier` 数据目录、`AppUserModelId\cc-notifier` AUMID、`.claude/cc-notifier.json` —— 保持向后兼容)。
- 非 Windows 平台以降级模式加载插件并输出明确日志(Toast 依赖 Windows;headless/雷达环境保持可用)。

### 修复

- 移除工具出错通知(用户决策):工具失败不会让 agent 停下,通知只徒增噪音。`tool-result` 从通知类型移除(Claude Code 不再注入 PostToolUse hook;dsh `tool/result` 不再映射)。
- Claude Code 跑在独立 Windows Terminal(无 `-d` 参数、标题不含项目名)时,通过 `?` 前缀动态标题绑定 —— 全局匹配但仅对 Claude Code 事件生效(dsh-tui 会话不会被绑到 CC 窗口)。
- 未重新触发 session-start 的既有 Claude Code 会话获得懒绑定兜底:无绑定的 claude 事件 toast 取最近 `?` 标签终端窗口为跳转目标,无需重开会话即可点击跳转。
- 插件已发布到 GitHub Packages(`@baobaolaodie/cc-dsh-notifier`,public);tarball 与 git 安装不受影响(root patch 保持 `cc-dsh-notifier`,与 git 安装依赖名一致)。

- test 命令改为显式列出测试文件(替代 glob),修复 Node 18 Windows 上 `npm test` 失败(`Could not find 'test/*.test.mjs'`)。
- 通知文案按系统显示语言输出(`auto`),可由新配置项 `language`(`zh`/`en`)覆盖;英文系统用户收到英文通知。
- PR 模板与文档不再写死测试数量(`npm test` → 全部通过);模板复选框 label 不再与实际测试数脱节。
- Comet 产物(`.comet/`、`docs/openspec/`、`docs/superpowers/`)不再纳入版本控制;磁盘保留,作为本地过程产物。
- 宿主环境解析到不同 `python`(缺 winrt)时 Toast 不再崩溃:安装器把解释器绝对路径写入 `pythonPath`。
- 聚焦判定改用实时前台查询(替代陈旧轮询缓存),消除"已切走仍被静默"的假静默(及反向竞态)。
- Windows Toast 点击跳转现在通过 UIA 激活 DeepSeek Harness 浏览器 tab(候选匹配:会话标题 → 产品名)。

## [0.1.0] - 2026-08-14

首个发布:Claude Code 会话的 Windows 桌面通知系统。

### 新增

- 三类中断事件通知:权限请求、AskUserQuestion 提问、Stop(等待输入)
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
