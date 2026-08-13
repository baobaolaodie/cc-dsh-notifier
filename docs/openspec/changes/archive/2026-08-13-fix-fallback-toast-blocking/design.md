## Context

BUG-1:`notify-agent.mjs` 的 `showBasicToast`(daemon 不可用时的 fallback 降级路径)spawn `toast-agent.py` 后等待其退出;toast-agent.py 显示 Toast 后存活 `duration(20)+5=25` 秒等待点击。**点击才提前退出(hook 结束);不点击则 hook 阻塞 25 秒**。违反 spec「通知失败不阻断会话」。

## 修复方案

将 `showBasicToast` 改为 **fire-and-forget**:

```js
function showBasicToast(cfg, event) {
  const { title, body } = toastContent(event);
  const args = [TOAST, '-Title', title, '-Body', body];
  if (event.projectName) args.push('-Project', event.projectName);
  if (cfg.sound === false) args.push('-nosound');
  const child = spawn('python', args, { windowsHide: true, stdio: 'ignore' });
  child.on('error', () => {}); // 仅吞掉 spawn 错误,不等待
  return Promise.resolve();    // 立即返回,hook 不被阻塞
}
```

- 备选方案「fallback 用短 duration(5 秒)」:仍需等待 5 秒,只是缩短而非消除阻塞,不满足「不阻断」语义 → 不采用
- 备选方案「fallback 也解析窗口句柄实现跳转」:复杂度高(转发器需自行枚举窗口),spec 已声明「降级通知(无点击跳转)」→ 不采用
- toast-agent.py 进程仍会存活至超时/点击,但其生命周期与 hook 解耦,不再阻塞会话

## 边界条件

- `spawn('python')` 失败(如 Python 不存在):error 事件被吞,resolve 已返回 → hook 立即结束,无异常
- 多个 fallback toast 并发:各自独立进程,系统 Toast 一条条显示(既有行为)
- daemon 路径:不受影响(daemon 的 showToast 已 fire-and-forget)
