---
comet_change: cc-notifier
role: technical-design
canonical_spec: openspec
---

# cc-notifier 技术设计

Claude Code 会话在需要用户介入(权限请求 / AskUserQuestion / 输出完成等待输入 / 工具报错)且会话窗口未聚焦时,通过 Windows 原生 Toast + 声音通知用户,支持上下文摘要、项目名区分、点击跳转回会话窗口、全局默认生效与项目级覆盖。

## Context

- 目标平台:Windows 11(win32),Claude Code CLI(终端 / VS Code 集成终端)
- 运行时:Node.js(已有)+ Windows PowerShell 5.1+(系统自带,可调 WinRT)
- 零第三方 npm 依赖;hook 脚本每次事件调用一次,必须秒级退出,不得阻塞 Claude Code
- 需求契约见 `docs/openspec/changes/cc-notifier/specs/cc-notifier/spec.md`;高层框架见 `docs/openspec/changes/cc-notifier/design.md`
- 会话生命周期 hooks(`SessionStart`/`SessionEnd`)可用于托管常驻进程生命周期,这是本设计的基础前提

## Goals / Non-Goals

**Goals:**

- 常驻进程生命周期与 Claude Code 会话绑定:有会话才跑、无会话自动退,无开机自启
- 点击跳转精确到窗口句柄(`SetForegroundWindow`),不做标题模糊匹配
- 通知服务不可用时降级为基础 Toast,不静默丢失
- 任何通知链路失败都不得中断 Claude Code 会话
- 多会话并行时按项目名区分通知

**Non-Goals:**

- 不覆盖 hooks 事件之外的系统级异常(API 断连等)——由 Stop 事件兜底
- 不做通知历史 UI、跨设备推送、静默时段(用户明确不需要)
- 不修改 Claude Code 本体;不引入第三方 npm 依赖
- 不做开机自启;常驻进程仅随会话生命周期运行

## 架构

```
┌─ Claude Code 会话 ──────────────────────────────────────────────┐
│ hooks: SessionStart / PermissionRequest / PreToolUse           │
│        (matcher: AskUserQuestion) / PostToolUse / Stop /       │
│        SessionEnd                                               │
│          │                                                      │
│          ▼ 每个事件:node scripts/notify-agent.mjs <event>       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 转发器 notify-agent.mjs(轻量,秒级退出,不阻塞会话)          │  │
│  │ ① 解析 hook JSON → 规范化事件载荷                          │  │
│  │ ② 读单实例状态文件 → 常驻进程在跑?                        │  │
│  │    ├─ 在跑 → HTTP POST 转发事件                            │  │
│  │    └─ 不在跑 → fallback:PowerShell 直接发基础 Toast        │  │
│  │ ③ SessionStart → 进程不在则 spawn;SessionEnd → 注销会话    │  │
│  └────────────────────────┬──────────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────────┘
                            │ 本地 HTTP(localhost,随机端口,状态文件握手)
                            ▼
┌─ 常驻进程 daemon.mjs(单实例,会话空 + 60s 超时自动退出)─────────┐
│ ① 会话集合 {session_id → cwd}                                  │
│ ② 窗口映射表:5s 定时枚举顶层窗口 → 标题解析 → {hwnd → cwd}      │
│ ③ 聚焦判定:GetForegroundWindow → 查表比对事件 cwd              │
│    ├─ 命中且相等 → 聚焦,静默                                   │
│    └─ 未命中/不等 → 失焦,进入去重                              │
│ ④ 去重:同类型事件 10s 窗口合并                                  │
│ ⑤ spawn toast.ps1(传 标题/正文/项目名/窗口句柄)                │
└────────────┬───────────────────────────────────────────────────┘
             ▼
┌─ toast.ps1(展示后保持存活至 Toast 生命周期结束)─────────────────┐
│ 创建 WinRT Toast(带声音) → 阻塞等待 Activated/Dismissed        │
│ 用户点击 → Activated → SetForegroundWindow(窗口句柄) → 聚焦    │
└────────────────────────────────────────────────────────────────┘
```

## 组件设计

### 1. 转发器 `scripts/notify-agent.mjs`

- 入口:`node scripts/notify-agent.mjs <event>`,hook JSON 从 stdin 读取
- 事件载荷规范化:
  - `session-start`:session_id、cwd
  - `permission-request`:cwd、tool_name(从 `tool_use` 解析)、命令摘要(如 Bash 命令,脱敏:仅保留命令本身)
  - `ask-user-question`:cwd、问题预览(截断到 ~80 字符)
  - `tool-result`(PostToolUse):cwd、tool_name、错误标志与错误摘要(从 `tool_response` 解析);非错误结果不通知
  - `stop`:cwd(仅失焦且通过去重时通知"Claude 等待输入")
  - `session-end`:session_id
- 常驻进程发现:读状态文件 `%LOCALAPPDATA%\cc-notifier\daemon.json`(`{port, pid, startedAt}`);HTTP 请求失败视为进程不在
- fallback 路径:进程不在且事件需要通知 → spawn `powershell -File scripts/toast.ps1` 发基础 Toast(标题/正文/项目名,无窗口句柄 → 无跳转)
- `session-start` 时进程不在 → spawn `node scripts/daemon.mjs`(单实例锁保证只有一个)
- 平台检查:非 win32 直接退出(exit 0),不报错
- 所有异常:捕获并写日志文件 `%LOCALAPPDATA%\cc-notifier\notify-agent.log`,exit 0(绝不阻断 hook)

### 2. 常驻进程 `scripts/daemon.mjs`

- **单实例**:绑定本地随机端口前先检查 `daemon.json` 的 pid 是否存活;启动成功后原子写 daemon.json
- **HTTP 服务**:`http.createServer`(localhost,随机端口),端点 `POST /event`;串行处理,请求体即规范化事件载荷
- **会话集合**:`Map<session_id, {cwd, lastSeen}>`;`session-start` 注册、`session-end` 注销;集合为空时启动 60s 空闲计时器,超时自动退出(进程退出时删除 daemon.json)
- **窗口映射表**:每 5s `EnumWindows` 枚举顶层可见窗口 → `GetWindowThreadProcessId` 取进程 → 按进程名白名单(`WindowsTerminal.exe`、`Code.exe`、`cmd.exe`、`pwsh.exe`、`powershell.exe`、`conhost.exe`)→ 读窗口标题 → 解析目录名(取标题中形如目录名的最后一段,含 `\`/`/` 或匹配已知 cwd 的 basename)→ 维护 `Map<hwnd, cwd>`;映射表在聚焦判定前建立(事件到达时若表为空则先刷一次)
- **聚焦判定**:`GetForegroundWindow` → hwnd → 查表:
  - 命中且 `cwd` 与事件 cwd 相等 → 聚焦 → 静默
  - 命中但不相等 → 失焦 → 通知
  - 未命中(映射缺失)→ 按「宁打扰勿漏」→ 通知
- **去重**:`Map<eventType, lastNotifiedAt>`;同类型 10s 窗口内的后续事件合并(仅更新最后通知时间,不重复弹窗)
- **Toast 触发**:去重通过后 spawn `powershell -File scripts/toast.ps1 -Title ... -Body ... -Project ... -Hwnd <hex>`

### 3. Toast 脚本 `scripts/toast.ps1`

- 用 WinRT:`[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]`
- 构造 XML Toast:文本内容(标题=事件类型+项目名,正文=上下文摘要)、`<audio src="ms-winsoundevent:Notification.Default"/>` 声音
- 使用 `ToastNotificationManager.CreateToastNotifier(appId)`——appId 使用常驻进程的 AUMID 占位(验证:非打包应用使用任意稳定 appId 展示 Toast 的兼容性;若不兼容则回退 `[Windows.ApplicationModel.Package]` 缺省路径,spike 定)
- 注册 `add_Activated` 事件:回调中 `SetForegroundWindow([IntPtr]$Hwnd)`
- 展示后进程保持存活(`WaitForSingleObject` 等待 `dismissed` 或 `activated` 或 30s 超时)后退出;stdout 输出结果(activated/dismissed/timeout)供 daemon 日志
- **关键 spike**:Activated 回调在 PowerShell 进程内的可靠性(见 Spike 计划)

### 4. 安装/卸载 `scripts/install.mjs` / `scripts/uninstall.mjs`

- install:备份并合并 `~/.claude/settings.json` → 注入 hooks(`SessionStart`/`PermissionRequest`/`PreToolUse`/`PostToolUse`/`Stop`/`SessionEnd` 均指向 `notify-agent.mjs`);生成默认配置 `~/.cc-notifier/config.json`
- uninstall:移除注入的 hooks 条目,恢复备份
- 项目级关闭:读取项目根 `.claude/cc-notifier.json`(`{"enabled": false}`)→ 转发器直接退出不通知;不依赖 Claude Code 的 settings 合并语义

### 5. 配置 `~/.cc-notifier/config.json`

```json
{
  "enabled": true,
  "dedupWindowMs": 10000,
  "sound": true
}
```

- `enabled: false` → 全局关闭(转发器直接退出)
- 项目级 `.claude/cc-notifier.json` 优先级最高

## 数据流示例(权限请求)

1. 用户切到浏览器;Claude 请求执行 `npm install` 的权限
2. `PermissionRequest` hook → `node notify-agent.mjs permission-request`,stdin 为 hook JSON
3. 转发器解析出 `{type, cwd, tool: Bash, command: npm install}` → 读 daemon.json → POST 到常驻进程
4. 常驻进程:聚焦判定(前台=浏览器,映射表无浏览器条目 → 失焦)→ 去重通过 → spawn toast.ps1(标题"cc-notifier · 权限请求",正文"Bash 请求执行:npm install",Hwnd=会话窗口句柄)
5. toast.ps1 展示 Toast+声音;用户点击 → Activated → SetForegroundWindow(hwnd) → 终端窗口回到前台

## 边界条件与错误处理

- 常驻进程被 kill / 未启动 → 转发器 fallback 基础 Toast;日志记录降级事件
- 两个会话同时启动 → 单实例锁,后者复用现有进程;daemon.json 原子写
- hook JSON 缺字段 → 用默认值填充,不抛异常
- 窗口标题解析失败(自定义标题)→ 映射缺失 → 宁打扰勿漏 → 通知
- 同项目多窗口 → 事件 cwd 归属歧义 → 按失焦处理通知(保守)
- 通知失败(PS 缺失/WinRT 异常)→ 捕获写日志,exit 0,绝不影响 hook 退出码
- 去重表与映射表内存上限:会话数 × 窗口数有限(单用户桌面),不做持久化
- 日志轮转:单文件,超 1MB 截断重写

## 测试策略

### 单元测试(无框架,node:test 或断言脚本)

- 事件解析:四类真实 hook JSON 样例 → 规范化载荷断言
- 去重逻辑:同类型 10s 窗口合并、不同类型不合并
- 配置合并:全局 + 项目级覆盖优先级
- 窗口标题解析:各类标题样例(含中文路径、Windows Terminal 多标签)→ 目录名断言

### Spike 验证(实现早期,任务 3.1/前置)

1. **toast.ps1 Activated 可靠性**:PowerShell 进程内 Toast 点击能否可靠触发回调并 SetForegroundWindow
2. **窗口标题→cwd 解析率**:在用户真实环境枚举窗口,统计标题解析成功率;Windows Terminal 多标签页场景(窗口标题=活跃标签)
3. **AUMID 兼容性**:非打包应用自定义 appId 展示 Toast 是否稳定

### 集成测试(手动场景矩阵)

| 场景 | 事件 | 聚焦 | 期望 |
|------|------|------|------|
| 失焦权限请求 | permission-request | 失焦 | Toast+声音+命令摘要+项目名,点击跳转 |
| 失焦提问 | ask-user-question | 失焦 | Toast 含问题预览 |
| 失焦输出完成 | stop | 失焦 | Toast"等待输入" |
| 失焦工具失败 | tool-result(error) | 失焦 | Toast 含错误摘要 |
| 聚焦任一事件 | 任意 | 聚焦 | 无通知 |
| 连续事件 | 任意×3 | 失焦 | 10s 内仅 1 条 |
| 进程被杀 | 任意 | 失焦 | 基础 Toast(无跳转) |
| 项目关闭 | 任意 | 失焦 | 无通知 |
| 多会话 | 任意×2 项目 | 失焦 | 项目名区分 |

## 风险与缓解

- [toast.ps1 Activated 回调在 PS 内不可靠] → spike 提前验证;失败备选:daemon 内用 `WScript.Shell` + toast 激活参数 + 后台 PS 兜底;再失败:降级为仅通知(更新 spec 需重新确认)
- [窗口标题解析率低导致通知轰炸] → 宁打扰勿漏是用户确认策略;解析率在 spike 实测后,若明显低(如 <50%)回到用户决策
- [SessionStart/End hooks 在多会话/VS Code 场景触发不稳定] → 生命周期附加兜底:daemon 60s 空闲超时 + 转发器 fallback 双保险,最坏情况仅是重复 spawn(单实例锁防住)
- [settings.json 合并破坏用户配置] → install 先备份;合并逻辑单元测试覆盖
- [hook 阻塞影响会话] → 转发器同步逻辑极薄(<100ms),所有外部调用加超时,异常 exit 0

## Migration Plan

1. `node scripts/install.mjs` — 备份+合并 hooks、生成默认配置;输出安装摘要
2. 手动测试:`node scripts/test.mjs`(触发各类事件,验证通知)
3. 卸载:`node scripts/uninstall.mjs` — 移除 hooks、恢复备份;daemon 由空闲超时自行退出或被杀

## Open Questions

- 无阻塞性开放问题;spike 结果若改变 spec 行为(如跳转不可行)需回到用户确认
