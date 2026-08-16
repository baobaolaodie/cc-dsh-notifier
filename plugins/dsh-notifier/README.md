# @baobaolaodie/cc-dsh-notifier

DeepSeek Harness → cc-dsh-notifier 适配插件:订阅 dsh 会话事件,转发给 cc-dsh-notifier
daemon,复用其 Windows Toast + 点击跳转管线。web 与 tui 两个 surface 共用同一插件。

- **事件映射**:`session/created` → session-start;`approval/asked` → permission-request;
  `tool/call(ask_user_question)` → ask-user-question;  `agent/status` running→idle → stop(等待输入);`session/disposed` → session-end
- **surface 检测**:argv 含 `--profile web` → web(浏览器绑定);其余(dsh-tui 等)→ tui(终端绑定);
  `CCN_SURFACE` 可强制覆盖
- **与 cc-dsh-notifier 共享库经相对路径引用**(插件随仓库分发);daemon/toast 路径可用
  `CCN_STATE_FILE` / `CCN_DAEMON_PATH` / `CCN_TOAST_PATH` 覆盖

## 关键机制

- **daemon 生命周期**:任何通知事件都能拉起 daemon;空闲 60s 退出;宿主退出(hostPid 探测)
  ~90s 内清理;代码变更自动自我重启
- **daemon 重启自愈(resync)**:检测状态文件 pid 变化 → 自动重发全部已注册会话的
  session-start(绑定/聚焦恢复)
- **聚焦静默由 daemon 判定**:在看 → 静默,切走 → 弹;无插件侧交互抑制
- **性能红线**:session/event 热路径先纯内存过滤(Set.has)再读配置/语言;`gate()` 按 cwd
  缓存(有界 64);resync 仅在通知事件路径执行

## 安装(本地开发,仓库根目录执行)

```bash
dsh plugin --profile web add ./plugins/dsh-notifier
dsh plugin --profile dsh-tui add ./plugins/dsh-notifier
```

- **Windows 跨盘 junction 缺陷**:`link:` 本地依赖在 pnpm workspace + 跨盘(C 盘 profile /
  D 盘仓库)时 junction 目标被拼接成死链 → reconcile 认不出 `dsh.bundle`。兜底两步:
  1. 修复 junction:`rmdir <profile>/node_modules/@baobaolaodie/cc-dsh-notifier` + `New-Item -ItemType
     Junction -Path <profile>/node_modules/@baobaolaodie/cc-dsh-notifier -Target <仓库>/plugins/dsh-notifier`
  2. 触发 reconcile(只读 pnpm 命令,不重建死链):`dsh plugin --profile <name> list`
- 验证:`dsh --profile <name> --dump-config` 出现 `# == @baobaolaodie/cc-dsh-notifier` 层
- **零手工路径(推荐)**:打包自包含 tarball 后一条命令安装(从 store 提取,不走 junction,
  无跨盘缺陷)——最简单,不需要 clone 仓库,也不需要任何凭据;
- **git 安装(公开可用,零配置)**:`dsh plugin add github:baobaolaodie/cc-dsh-notifier`(会 clone
  整个仓库,依赖名取根 package.json 的 name);
- **GitHub Packages(个人便捷渠道)**:`dsh plugin --profile <name> add @baobaolaodie/cc-dsh-notifier`
  ```bash
  # profile 的 .npmrc 加两行(包当前为 private,下载需要 token;改为 public 后可匿名):
  @baobaolaodie:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=<GitHub PAT with read:packages>
  ```
- **git 安装**:`dsh plugin add github:baobaolaodie/cc-dsh-notifier`(仓库根声明 `dsh.bundle`,
  插件行按包名 `cc-dsh-notifier` 解析,入口取根 package.json 的 `main`;已端到端验证)
- 卸载:`dsh plugin --profile <name> remove @baobaolaodie/cc-dsh-notifier`

## 发布打包

运行时(daemon/toast-agent/win32 桥/共享库/图标)由 `scripts/vendor-dsh-plugin.mjs`
同步进本包的 `lib/runtime/`(`prepare`/`pretest`/`prepack` 自动执行,幂等;runtime
**入库**以支持 git 安装)。打包:

```bash
cd plugins/dsh-notifier && pnpm pack    # → baobaolaodie-cc-dsh-notifier-<version>.tgz(prepack 自动 vendor)
# 安装(零手工):
dsh plugin --profile <web|dsh-tui> add ./baobaolaodie-cc-dsh-notifier-<version>.tgz
```

发布到 GitHub Packages 后:`dsh plugin --profile <name> add @baobaolaodie/cc-dsh-notifier`(profile/.npmrc 需配 `@baobaolaodie:registry=https://npm.pkg.github.com`)。

## 依赖

- cc-dsh-notifier 仓库(相对路径引用 `scripts/lib/{events,config}.mjs` 等)
- `~/.cc-notifier/config.json`:`enabled` / `language` / `dedupWindowMs` /
  `pollIntervalMs` / `pythonPath`(toast 解释器绝对路径,install.mjs 检测时写入)/
  `windowWhitelist`(浏览器窗口白名单,web surface 绑定/聚焦用)
