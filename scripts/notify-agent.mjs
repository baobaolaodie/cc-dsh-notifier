#!/usr/bin/env node
// 转发器:node scripts/notify-agent.mjs <eventType>,hook JSON 从 stdin 读取
// eventType ∈ session-start | session-end | permission-request | ask-user-question | stop
// (tool-result 已移除通知:工具出错不会让 agent 停下,徒增噪音,2026-08-16 用户决策)
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEvent, toastContent, NOTIFY_TYPES } from './lib/events.mjs';
import { loadConfig, resolveLanguage } from './lib/config.mjs';
import { readState, isPidAlive } from './lib/state.mjs';
import { log } from './lib/logger.mjs';

const DAEMON = fileURLToPath(new URL('./daemon.mjs', import.meta.url));
const TOAST = fileURLToPath(new URL('./toast-agent.py', import.meta.url));

async function main() {
  const eventType = process.argv[2] || '';
  if (process.platform !== 'win32') process.exit(0); // 非 win32 直接退出,不报错

  let hookJson = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) hookJson = JSON.parse(raw);
  } catch (err) {
    log('notify-agent', 'hook JSON 解析失败', err.message);
  }

  // 语言先于 parseEvent 解析:summary/标题文案在事件解析时即按语言生成
  const cfg = loadConfig(hookJson.cwd || ''); // 含项目级 .claude/cc-notifier.json 关闭
  // 仅通知事件解析语言(session-start/end 不弹 Toast,省去 reg 检测开销 ~30-80ms/hook)
  const lang = NOTIFY_TYPES.has(eventType) ? resolveLanguage(cfg) : 'zh';
  const event = parseEvent(eventType, hookJson, lang);
  if (!event) process.exit(0); // 未知类型(含已移除的 tool-result)
  if (cfg.enabled === false) process.exit(0);
  // 精确窗口绑定:把 Claude Code 宿主进程 pid 带给 daemon,daemon 可像 dsh-tui 一样
  // 用 AttachConsole 解析真实终端/伪终端窗口,避免全局 `?` 标签猜测(2026-08-18)
  event.hostPid = process.ppid;

  const state = readState();
  if (state && isPidAlive(state.pid)) {
    const ok = await postEvent(state.port, event);
    if (ok) process.exit(0);
    // 转发失败(daemon 假活或瞬断):NOTIFY 事件继续走下方 fallback toast,其余静默退出
    log('notify-agent', 'HTTP 转发失败,降级处理', eventType);
  }

  // 常驻进程不在
  if (eventType === 'session-start') {
    const child = spawn(process.execPath, [DAEMON], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    log('notify-agent', 'spawn daemon pid=' + child.pid);
    // 轮询状态文件等待 daemon 就绪(最多 10 × 100ms = 1s),成功则重发 session-start;
    // 否则 daemon 会话集合为空,60s 空闲超时会退出,后续通知长期降级 fallback
    const port = await waitDaemonReady();
    if (port) {
      await postEvent(port, event);
      log('notify-agent', '重发 session-start,daemon port=' + port);
    } else {
      log('notify-agent', 'daemon 启动超时,session-start 未注册,后续事件走 fallback');
    }
    process.exit(0);
  }

  // 其余通知事件:同样先尝试拉起 daemon 再转发(保持跳转能力),拉起失败才降级
  // fallback(2026-08-16 用户反馈"daemon 启动不智能":此前 daemon 死后仅 session-start 能拉起)
  if (NOTIFY_TYPES.has(eventType)) {
    const child = spawn(process.execPath, [DAEMON], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    log('notify-agent', 'spawn daemon pid=' + child.pid, eventType);
    const port = await waitDaemonReady();
    if (port) {
      const ok = await postEvent(port, event);
      if (ok) process.exit(0);
      log('notify-agent', '重发失败,降级 fallback', eventType);
    }
    await showBasicToast(cfg, event); // fallback:基础 Toast(无窗口句柄 → 无跳转)
    log('notify-agent', 'fallback toast', eventType);
  }
  process.exit(0);
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

// 返回 Promise<boolean>:HTTP 2xx 响应视为转发成功(true);超时/连接失败/非 2xx 为失败(false)
function postEvent(port, event) {
  return new Promise((resolve) => {
    const body = JSON.stringify(event);
    const req = http.request(
      { host: '127.0.0.1', port, path: '/event', method: 'POST', timeout: 1000,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
      },
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false)); // 失败视为进程不在/假活,调用方降级
    req.write(body);
    req.end();
  });
}

// HTTP 探测:端口有 HTTP 响应视为存活(避免 waitDaemonReady 读到残留状态提前返回)
function portResponds(port) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/', method: 'GET', timeout: 1000 },
      (res) => { res.resume(); res.on('end', () => resolve(true)); },
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// 轮询状态文件等待 daemon 就绪(最多 10 × 100ms),返回 daemon 端口;超时返回 null
function waitDaemonReady() {
  return new Promise((resolve) => {
    let tries = 0;
    const tick = async () => {
      const state = readState();
      // 额外验证端口有 HTTP 响应:残留状态(pid 存活但端口不可达)不视为就绪,
      // 等待新 daemon 写入状态文件后再重发
      if (state && isPidAlive(state.pid) && await portResponds(state.port)) return resolve(state.port);
      if (++tries >= 10) return resolve(null);
      setTimeout(tick, 100);
    };
    tick();
  });
}

// fire-and-forget:spawn 后立即 resolve,不等待 toast-agent.py 退出。
// toast-agent.py 显示 Toast 后存活至用户点击或超时(默认 25s);若等待其退出,
// fallback 路径会把 hook 阻塞最长 25 秒,违反 spec「通知失败不阻断会话」
// (BUG-1,2026-08-13 实测 25282ms 阻塞)。Toast 仍正常显示,仅生命周期与 hook 解耦。
function showBasicToast(cfg, event) {
  const { title, body } = toastContent(event);
  const args = [TOAST, '-Title', title, '-Body', body];
  if (event.lang) args.push('-Lang', event.lang); // Toast XML lang 属性
  if (event.projectName) args.push('-Project', event.projectName);
  if (cfg.sound === false) args.push('-nosound'); // 统一参数名(toast-agent.py 小写比较解析)
  // detached:true:notify-agent 退出后 toast-agent.py 不被宿主 Job Object 连带杀掉。
  // (实测:不 detached 时 hook 退出即杀子进程,Toast 不显示——fallback 静默丢失)
  // 解释器固定用配置的绝对路径(2026-08-16:裸 python 依赖宿主 PATH,可能解析到无 winrt
  // 的解释器 → Toast 启动即崩;pythonPath 为空时回退裸 python 保持兼容)
  const py = cfg.pythonPath || 'python';
  const child = spawn(py, args, { detached: true, windowsHide: true, stdio: 'ignore' });
  child.on('error', () => {}); // 吞掉 spawn 失败(如 Python 缺失),hook 不受影响
  child.unref(); // 父进程退出不等待子进程
  return Promise.resolve();
}

main().catch((err) => {
  log('notify-agent', '未捕获异常', err.stack || err.message);
  process.exit(0); // 绝不影响 hook 退出码
});
