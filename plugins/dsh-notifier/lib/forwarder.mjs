// 转发器:daemon 发现 + HTTP POST /event + spawn 唤醒 + fallback Toast。
// 逻辑镜像 scripts/notify-agent.mjs,保证行为一致:
// 单实例状态文件握手、1s 超时、detached spawn(防 Job Object 连杀子进程)。
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toastContent } from './runtime/lib/events.mjs';

// 与 scripts/lib/state.mjs 的 STATE_FILE 同路径;env 覆盖仅测试/部署用
export const STATE_FILE = process.env.CCN_STATE_FILE || path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'cc-notifier',
  'daemon.json',
);
// 运行时随发布包分发(runtime/ 由 scripts/vendor-dsh-plugin.mjs 同步);env 覆盖仅测试用
const DAEMON = process.env.CCN_DAEMON_PATH || fileURLToPath(new URL('./runtime/daemon.mjs', import.meta.url));
const TOAST = process.env.CCN_TOAST_PATH || fileURLToPath(new URL('./runtime/toast-agent.py', import.meta.url));

export function readState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (raw && typeof raw === 'object' && Number.isFinite(raw.port) && Number.isFinite(raw.pid)) {
      return { port: raw.port, pid: raw.pid, startedAt: raw.startedAt || 0 };
    }
    return null;
  } catch {
    return null;
  }
}

export function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// 返回 Promise<boolean>:HTTP 2xx 视为转发成功;超时/连接失败/非 2xx 为失败(调用方降级)
function postEvent(port, event) {
  return new Promise((resolve) => {
    const body = JSON.stringify(event);
    const req = http.request(
      {
        host: '127.0.0.1', port, path: '/event', method: 'POST', timeout: 1000,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
      },
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

// 端口有 HTTP 响应视为存活(避免读到残留状态文件)
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

function spawnDaemon() {
  const child = spawn(process.execPath, [DAEMON], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {});
  child.unref();
  return child;
}

// 轮询状态文件等待 daemon 就绪(最多 10 × 100ms),返回端口;超时返回 null
async function waitDaemonReady() {
  for (let tries = 0; tries < 10; tries += 1) {
    const state = readState();
    if (state && isPidAlive(state.pid) && await portResponds(state.port)) return state.port;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

// fire-and-forget 基础 Toast(daemon 不可用时的降级;无窗口句柄 → 无跳转)
function showFallbackToast(event) {
  const { title, body } = toastContent(event);
  const args = [TOAST, '-Title', title, '-Body', body];
  if (event.lang) args.push('-Lang', event.lang);
  if (event.projectName) args.push('-Project', event.projectName);
  if (event.sessionTitle) args.push('-SessionTitle', event.sessionTitle);
  if (event.surface) args.push('-Surface', event.surface); // web 显示身份用 DeepSeek Harness
  const child = spawn('python', args, { detached: true, windowsHide: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

// 统一入口:转发一个规范化事件。
// - daemon 存活 → HTTP 转发,成功即结束
// - daemon 不在(任何通知事件,不只 session-start)→ spawn daemon + 轮询就绪 + 重发;
//   拉起失败才降级 fallback(2026-08-16 用户反馈"daemon 启动不智能":此前仅
//   session-start 会拉起,daemon 死后审批/提问等事件全走无跳转的 fallback)
// - session-end 且 daemon 不可用 → 直接丢弃(无会话可注销)
export async function forward(event) {
  const state = readState();
  if (state && isPidAlive(state.pid)) {
    const ok = await postEvent(state.port, event);
    if (ok) return;
  }
  if (event.type === 'session-end') return;
  spawnDaemon();
  const port = await waitDaemonReady();
  if (port) {
    const ok = await postEvent(port, event);
    if (ok) return;
  }
  if (event.type !== 'session-start') showFallbackToast(event); // 拉起失败才降级
}
