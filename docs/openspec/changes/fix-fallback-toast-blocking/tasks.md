## 1. 修复与验证

- [x] 1.1 复现问题并记录失败证据:daemon 不在时触发 fallback toast,hook 阻塞 25 秒(历史日志已有证据;用最小步骤复现一次,实测 25282ms)
- [x] 1.2 修改 `scripts/notify-agent.mjs` 的 `showBasicToast` 为 fire-and-forget(spawn 后立即 resolve,不等待 exit;**加 detached:true + unref 防止宿主 Job Object 连杀子进程导致 Toast 不显示**)
- [x] 1.3 验证修复:daemon 不在时触发 fallback toast,hook 立即返回(实测 112ms),Toast 正常显示(实测 shown 记录存在)
- [x] 1.4 回归:daemon 正常路径仍工作(转发 → 聚焦判定 → Toast),`npm test` 39/39 通过
