# cc-dsh-notifier 交接与恢复笔记

> 2026-08-13 会话结束交接。记录项目状态、已知问题与恢复方法。
> **2026-08-13(第二次修订)**:依据会话 jsonl + 子代理 transcript 逐字节回放,恢复被误判为不可恢复的真实历史版本;本文件同步更新。

## 项目状态(2026-08-13,真实历史版)

- **Change 已归档**:cc-dsh-notifier 完成 Comet Classic 全流程(open→design→build→verify→archive),产物在 `docs/openspec/changes/archive/2026-08-13-cc-notifier/`,主 spec 已合并到 `docs/openspec/specs/cc-notifier/spec.md`
- **git 历史已重建(真实版)**:2026-08-13 误用 `git filter-repo --path`(白名单语义)导致项目从历史丢失。恢复过程第一次凭记忆重建(有偏差),第二次从会话 jsonl + 20 个子代理 transcript 逐字节回放真实 Write/Edit,得到真实历史最终态,已验证:
  - **39/39 测试通过**(与 verify 报告一致;第一次记忆重建仅 38/38,因 window-title 测试断言被删减)
  - 9 个文件与记忆版有差异,其中 4 个含真实功能回归(toast-agent.py 的 -nosound 静音、daemon.mjs 的 clearState 所有权检查、install.mjs 的 AUMID 失败提示、uninstall.mjs 的 GBK 解码),已全部恢复为真实版
  - **历史中无工具目录(.codex/.claude/.agents/CLAUDE.md/AGENTS.md)、无 node_modules、无 .comet 运行时、无 spikes 实验脚本**
- **恢复源**:主会话 `<session-id>.jsonl`(4988 行,9.3M)+ 子代理 `<项目对应 projects 目录>/<session-id>/subagents/*.jsonl`(20 个,全部非空)。**注意:子代理记录在 `subagents/` 目录而非 `%TEMP%\tasks\*.output`(后者会被清理且当时为 0 字节)**
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

- 全局 `~/.claude/settings.json` 存在 **VS Code 扩展 `singularityinc.claude-notifier-3.6.1`** 的 hooks(PermissionRequest/PreToolUse/Stop/SubagentStop/UserPromptSubmit,PowerShell 同步播放声音,也阻塞 hook),与 cc-dsh-notifier 在 PermissionRequest/提问/Stop 三者**双挂** → 双弹 + 双阻塞
- **用户已删除该扩展,重启后生效**;`~/.claude/hooks/claude-notifier-*` 残留文件待清理
- cc-dsh-notifier 的 install.mjs 幂等检测只认 `notify-agent.mjs` 字符串,与旧工具不冲突

### 其他已知限制(用户已确认接受)

- 系统 Toast 一条条出现,不堆叠(系统级行为)
- 操作中心历史通知点击不跳转(进程退出后回调失效)
- 窗口绑定依赖终端标题含项目名;自定义标题时退化为无跳转(宁打扰勿漏)
- 异常退出(无 SessionEnd)后 daemon 最长滞留约 12h(TTL 设计权衡)
- **.comet/config.yaml 缺失**(项目+全局均无)→ Comet hook guard 报「Classic artifact layout is unavailable」,写文件需临时禁用 settings.local.json hooks;重建需 `comet init --scope project`

## 2026-08-14 教训(CI/PR 排查)

### ① CIExpected — Waiting for status to be reported(已修复,机制易被误改)

- 现象:PR 全部检查通过仍无法合并,分支保护卡 "CIExpected"。
- 根因:master 分支保护 `required_checks=["CI"]` 匹配 workflow 名,但 GitHub **不为此工作流产生工作流级 "CI" check run**(只产生 job 级,实测 check suite 仅 9 个 job 条目)→ 保护永远等不到该状态。
- 修复:ci.yml 新增**同名汇总 job `CI`**(`needs: [test, quality, pr-policy, docs-links]`)承担该 check;`if: !cancelled() && !failure()` 防 push 路径(pr-policy 被跳过)连带跳过。
- **警告:勿把 if 改为 `always()`**——依赖失败也会报告通过,门禁失效。

### ② pr-policy 的 webhook 快照坑(排查耗时最久)

- `context.payload.pull_request.body` 是 **run 触发瞬间的 webhook 快照**;`gh pr edit` 更新 body 后,已有 run(含重跑)仍用旧 body。
- 排查特征:**本地模拟检查逻辑全过但 CI 必失败**——先怀疑快照。
- 解决:新 push(如 `git commit --allow-empty`)触发新 run 生成新快照。

### ③ PR 模板 checkbox label 逐字节匹配

- ci.yml 用 `body.includes('- [x] ' + label)` 检查 PR body 每个复选框,label 须与 `.github/PULL_REQUEST_TEMPLATE.md` **逐字节一致**(含空格/箭头符号)。
- **模板 label 变更会立即破坏所有未更新 body 的已开 PR**——改模板前先同步已开 PR 的 body,或改后立即更新。
- 模板不应写死动态值(如测试数,2026-08-14 已去硬编码)。

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

## dsh 适配(2026-08-16,DeepSeek Harness 通知)

- **架构**:`plugins/dsh-notifier/` 插件(web/tui profile 通用,surface 按 argv 检测)→ cc-dsh-notifier daemon(复用 Toast/聚焦/跳转管线)。**三类通知**(权限请求/提问/等待输入)——工具出错通知已移除(2026-08-16 用户决策:工具失败不会让 agent 停下,只徒增噪音)。
- **安装(三种方式)**:①tarball `add ./baobaolaodie-cc-dsh-notifier-0.1.4.tgz`(零配置、不 clone 仓库、**最方便**,生产采用);②git `add github:baobaolaodie/cc-dsh-notifier`(公开零配置,但会 clone 整个仓库);③GitHub Packages `add @baobaolaodie/cc-dsh-notifier`(仅维护者渠道:**npm registry 下载始终需 token 即使 public**(2026-08-16 实证:public 后匿名仍 401);profile/.npmrc 配 `@baobaolaodie:registry=https://npm.pkg.github.com` + `//npm.pkg.github.com/:_authToken=<PAT read:packages>`)。Windows 跨盘 junction 缺陷兜底(仅 link 安装):修 junction + `dsh plugin --profile <name> list`。dump-config 验证 `# == <包名>` 层。
- **daemon 生命周期**:任何事件拉起 / 空闲 60s 退出 / hostPid 存活探测(~90s 清理)/ 代码变更 10s 自我重启 / 插件 resync 重注册会话。核心逻辑在 `scripts/lib/daemon-core.mjs`(可注入,25 项单测)。
- **聚焦判定**:预编译 `foreground.exe`(~150ms)实时查询 + 浏览器兜底(白名单浏览器标题含 DeepSeek Harness → 静默,**仅 web 事件**)。绑定恢复靠 resync。
- **CC 窗口绑定(2026-08-16 实测修复)**:CC 跑独立 Windows Terminal(无 -d、标题不含项目名)时靠 `?` 前缀动态标题绑定(全局匹配,仅 claude 事件;dsh-tui 会话 surface=tui 不匹配,防误绑);未重开 session-start 的既有会话走**懒绑定兜底**(toast 时从窗口枚举取 ? 标签窗口)。
- **关键配置**(`~/.cc-notifier/config.json`):`dedupWindowMs`(默认 0 不去重)、`pythonPath`(toast 解释器绝对路径,install.mjs 写入——裸 python 依赖 PATH 会崩,2026-08-16 实测)、`windowWhitelist`。等待输入交互抑制已移除(聚焦判定负责静默,2026-08-16 用户决策)。
- **测试**:102 项(移除工具出错相关 7 项后);`npm test` 显式清单。Python/PS 脚本无自动化测试(真实环境手动回归);? 标签绑定/懒绑定无单测(daemon.mjs 内,真实环境验证)。
- **发布/收录(2026-08-16 完成)**:生产 profile 用 **tarball 0.1.4**(零配置最方便);GitHub Packages 发布 `@baobaolaodie/cc-dsh-notifier`(0.1.3 为坏包——patch name 裸 @ 前缀 YAML 解析失败,0.1.4 修复并重发;`npm publish --registry=https://npm.pkg.github.com --access public`,下载需 token);根 package.json 声明 `dsh.bundle` + `main` 供 git 安装与生态雷达识别;runtime 入库(prepare/pretest 幂等同步);git 安装端到端验证(坑 1:patch 相对路径按 profile 目录解析,必须用包名;坑 2:root patch 名必须 = 根 package.json name(git 安装依赖名),scoped 名只用于子包);awesome-dsh-plugins 收录 PR #185 **已合并**(条目 cc-dsh-notifier);WSL Linux 加载级 PASS(降级日志)。
- **恢复**:daemon 被杀/异常 → 任何通知事件自动拉起;绑定丢失 → resync 自愈;改代码 → 自我重启,无需手动。