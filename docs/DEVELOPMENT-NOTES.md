# cc-notifier 交接与恢复笔记

> 2026-08-13 会话结束交接。记录项目状态、已知问题与恢复方法。
> **2026-08-13(第二次修订)**:依据会话 jsonl + 子代理 transcript 逐字节回放,恢复被误判为不可恢复的真实历史版本;本文件同步更新。

## 项目状态(2026-08-13,真实历史版)

- **Change 已归档**:cc-notifier 完成 Comet Classic 全流程(open→design→build→verify→archive),产物在 `docs/openspec/changes/archive/2026-08-13-cc-notifier/`,主 spec 已合并到 `docs/openspec/specs/cc-notifier/spec.md`
- **git 历史已重建(真实版)**:2026-08-13 误用 `git filter-repo --path`(白名单语义)导致项目从历史丢失。恢复过程第一次凭记忆重建(有偏差),第二次从会话 jsonl + 20 个子代理 transcript 逐字节回放真实 Write/Edit,得到真实历史最终态,已验证:
  - **39/39 测试通过**(与 verify 报告一致;第一次记忆重建仅 38/38,因 window-title 测试断言被删减)
  - 9 个文件与记忆版有差异,其中 4 个含真实功能回归(toast-agent.py 的 -nosound 静音、daemon.mjs 的 clearState 所有权检查、install.mjs 的 AUMID 失败提示、uninstall.mjs 的 GBK 解码),已全部恢复为真实版
  - **历史中无工具目录(.codex/.claude/.agents/CLAUDE.md/AGENTS.md)、无 node_modules、无 .comet 运行时、无 spikes 实验脚本**
- **恢复源**:主会话 `42368c4c-b951-4e15-8c54-ed76773c9dec.jsonl`(4988 行,9.3M)+ 子代理 `<项目对应 projects 目录>/<session-id>/subagents/*.jsonl`(20 个,全部非空)。**注意:子代理记录在 `subagents/` 目录而非 `%TEMP%\tasks\*.output`(后者会被清理且当时为 0 字节)**
- **spikes 实验脚本**:`scripts/spikes/`(21 个文件,含 AUMID/激活器/lnk/协议/COM 五条路径调试记录)恢复在磁盘但**不入库**(.gitignore 已排除);`recover.py`、`test-fixture-*.json` 同样恢复不入库

## 已知问题(遗留,需修复)

### BUG-1(重要):fallback 路径阻塞 hook 最多 25 秒

- **位置**:`scripts/notify-agent.mjs` 的 `showBasicToast`(daemon 不在时的降级路径)
- **现象**:`showBasicToast` spawn `toast-agent.py` 后**等待其退出**;而 toast-agent.py 显示 Toast 后保持存活(duration 20 + 5 = 25 秒)等待点击。**点击 Toast 才提前退出(hook 结束);不点击则 hook 阻塞 25 秒**——违反 spec「通知失败不阻断会话」
- **真实影响(2026-08-13 实测)**:notify-agent.log + toast-click.log 显示 22:01-22:54 连续 16+ 次 fallback toast,每次 hook 阻塞 25 秒(用户切到 flow-comet 等场景时同样触发)
- **根因**:fallback 路径把「显示 Toast」误当同步操作等待
- **修复方向**:`showBasicToast` 改为 fire-and-forget(不等待 exit,spawn 后立即 resolve);或 fallback 用短 duration(如 5 秒,无 hwnd 本无跳转);daemon 路径不受影响(daemon 已 fire-and-forget)

### BUG-2(设计限制,结合 BUG-1 造成困惑):fallback 场景点击无跳转

- **位置**:同上(fallback 无窗口句柄)
- **现象**:daemon 不在时,Toast 无 `-Hwnd` 参数,点击无跳转。用户必须点击才能提前结束 hook(BUG-1),点击又不跳转 → 体验差
- **修复方向**:优先修 BUG-1(不阻塞)后,fallback 点击行为可接受(设计 spec 已声明「降级通知(无点击跳转)」);如需 fallback 也跳转,转发器需自行解析窗口句柄(复杂度高,不建议)

### 两套通知系统并存(2026-08-13 发现,用户已自行处理)

- 全局 `~/.claude/settings.json` 存在 **VS Code 扩展 `singularityinc.claude-notifier-3.6.1`** 的 hooks(PermissionRequest/PreToolUse/Stop/SubagentStop/UserPromptSubmit,PowerShell 同步播放声音,也阻塞 hook),与 cc-notifier 在 PermissionRequest/提问/Stop 三者**双挂** → 双弹 + 双阻塞
- **用户已删除该扩展,重启后生效**;`~/.claude/hooks/claude-notifier-*` 残留文件待清理
- cc-notifier 的 install.mjs 幂等检测只认 `notify-agent.mjs` 字符串,与旧工具不冲突

### 其他已知限制(用户已确认接受)

- 系统 Toast 一条条出现,不堆叠(系统级行为)
- 操作中心历史通知点击不跳转(进程退出后回调失效)
- 窗口绑定依赖终端标题含项目名;自定义标题时退化为无跳转(宁打扰勿漏)
- 异常退出(无 SessionEnd)后 daemon 最长滞留约 12h(TTL 设计权衡)
- **.comet/config.yaml 缺失**(项目+全局均无)→ Comet hook guard 报「Classic artifact layout is unavailable」,写文件需临时禁用 settings.local.json hooks;重建需 `comet init --scope project`

## 恢复方法(如再次误删)

1. 会话记录:`~/.claude/projects/<项目路径编码>/*.jsonl`(含全部 Write/Edit)
2. **子代理 transcript:`<session-id>/subagents/agent-*.jsonl`(非 `%TEMP%\tasks\*.output`!)**——这是 2026-08-13 第一次恢复漏掉的关键证据源
3. 重建方法:主 jsonl + 全部子代理按时间戳跨源回放 Write(覆盖)+ Edit(替换);工具调用在 assistant 消息的 `content[]` 中(`type: tool_use`)

## 使用

```bash
node scripts/install.mjs    # 安装(注入 hooks + 注册 AUMID + 检测 Python/winrt)
node scripts/test.mjs <事件> # 手动触发测试(permission-request 等)
node scripts/uninstall.mjs  # 卸载
```

依赖:Node.js ≥ 18、Python 3 + winrt 包(winrt-runtime/winrt-Windows.UI.Notifications/winrt-Windows.Data.Xml.Dom)、PowerShell 5.1+(系统自带,窗口桥接)
