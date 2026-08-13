## 1. 项目骨架与事件模型

- [x] 1.1 初始化 Node 工程(package.json,无第三方依赖)
- [x] 1.2 定义统一通知事件模型:解析 hook JSON,规范化事件类型(permission_request / ask_user_question / stop / tool_error)及载荷字段(事件类型、cwd、项目名、工具名、命令/问题/错误摘要、时间戳)

## 2. 通知核心

- [x] 2.1 实现事件解析模块:从各类 hook JSON 载荷提取通知所需字段(权限请求的命令、AskUserQuestion 问题预览、PostToolUse 错误信息、Stop 项目名)
- [x] 2.2 实现聚焦检测模块:PowerShell `GetForegroundWindow` 获取前台窗口,与事件 cwd 目录名做标题/进程匹配,输出聚焦判定与降级策略
- [x] 2.3 实现 Windows Toast 显示模块:PowerShell 内联 WinRT 调用,展示 Toast + 声音,正文含事件类型、上下文摘要、项目名
- [x] 2.4 实现去重模块:失焦场景下同类事件短时间窗口(约 10 秒)去重,防止连发

## 3. 点击跳转

- [x] 3.1 Spike 验证:确认 Start Menu 快捷方式注册 AUMID + Toast 激活参数的方案在 Windows 11 的可行性;不可行则记录降级方案并更新 design.md
- [x] 3.2 实现激活处理器:点击 Toast 后按窗口标题线索 `AppActivate` 激活对应会话窗口
- [x] 3.3 集成点击链路:Toast 携带激活参数,点击后激活处理器正确聚焦对应窗口

## 4. 配置与安装

- [x] 4.1 实现安装脚本:备份并合并全局 `~/.claude/settings.json`,注入四类 hooks 事件配置
- [x] 4.2 实现卸载脚本:移除 hooks 条目并恢复备份
- [x] 4.3 实现项目级覆盖:项目开关文件或项目 `.claude/settings.json` 优先级生效,支持整项目关闭
- [x] 4.4 编写 README:安装、卸载、项目覆盖、手动测试命令说明

## 5. 验证

- [x] 5.1 手动触发四类事件,验证通知内容(权限命令/问题预览/错误摘要/等待输入)与项目名正确
- [x] 5.2 验证聚焦时静默、失焦时通知的聚焦感知行为
- [x] 5.3 验证点击 Toast 可跳转回对应会话窗口
- [x] 5.4 验证项目级关闭通知后该项目不再弹窗
