#!/usr/bin/env node
// 常驻进程:单实例、本地随机端口 HTTP、会话集合、窗口映射、聚焦判定、去重、Toast 触发
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTIFY_TYPES, toastContent, normalizeCwd, projectName } from './lib/events.mjs';
import { createDeduper } from './lib/dedup.mjs';
import { loadConfig, DEFAULT_CONFIG } from './lib/config.mjs';
import { readState, writeState, clearState, isPidAlive } from './lib/state.mjs';
import { log } from './lib/logger.mjs';
import { runWin32 } from './lib/win32.mjs';
import { buildWindowMap, isWhitelistedProcess } from './lib/window-map.mjs';
import { commandLineMatchesCwd } from './lib/proc-dir.mjs';
import { decideFocus } from './lib/focus.mjs';

const TOAST = fileURLToPath(new URL('./toast-agent.py', import.meta.url));
const IDLE_MS = 60 * 1000;   // 会话空后空闲超时
const POLL_MS = 5 * 1000;    // 窗口映射轮询周期
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 会话最长未活跃存活(异常退出兜底)
const PURGE_MS = 60 * 60 * 1000;             // 会话周期清理间隔(兜底:无事件到达也清理滞留会话)

const sessions = new Map();  // sessionId → { cwd, lastSeen }
let windowMap = new Map();   // hwnd(String) → cwd
let lastMapAt = 0;
let idleTimer = null;
const deduper = createDeduper(loadConfig(null).dedupWindowMs || DEFAULT_CONFIG.dedupWindowMs);

// 单实例锁:已有存活实例则退出。pid 存活但状态文件端口无 HTTP 响应 = 残留状态
// (pid 复用/进程假活),视为无实例,允许新 daemon 启动并覆盖状态文件
async function existingDaemonAlive(existing) {
  if (!isPidAlive(existing.pid)) return false;
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: existing.port, path: '/', method: 'GET', timeout: 1000 },
      (res) => { res.resume(); res.on('end', () => resolve(true)); },
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false)); // 端口无监听 = 残留状态
    req.end();
  });
}

const existing = readState();
if (existing && await existingDaemonAlive(existing)) {
  log('daemon', '已存在实例 pid=' + existing.pid, '退出');
  process.exit(0);
}
if (existing) log('daemon', '状态文件为残留(pid=' + existing.pid + '),启动新实例');

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/event') { res.writeHead(404).end(); return; }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (c) => { body += c; if (body.length > 64 * 1024) req.destroy(); });
  req.on('end', () => {
    // 送达确认语义:先立即回 ack,handleEvent 后台异步执行(fire-and-forget)。
    // handleEvent 含 runWin32('foreground')(实测 1.6-1.8s)与 pollWindows,总延迟 2-4s;
    // 若等其完成才响应,转发器 1s 超时会误判失败走 fallback toast → 健康 daemon 下双重
    // toast 回归。先 ack 后,fallback 仅在真连接失败(ECONNREFUSED 等)时触发
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    let event = {};
    try { event = JSON.parse(body || '{}'); } catch (err) { log('daemon', 'event JSON 解析失败', err.message); return; }
    handleEvent(event).catch((err) => log('daemon', 'handleEvent 异步异常', err && err.message || String(err)));
  });
  req.on('error', () => {});
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  writeState({ port, pid: process.pid });
  // 收窄单实例 check-then-act 竞态:并发启动时状态文件被他人覆盖(pid 非本进程)→ 退出,不抢所有权
  const check = readState();
  if (!check || check.pid !== process.pid) {
    log('daemon', '状态文件被其他实例覆盖,退出');
    process.exit(0);
  }
  log('daemon', '启动 port=' + port, 'pid=' + process.pid);
  pollWindows();
  setInterval(pollWindows, POLL_MS);
  // 周期清理兜底:会话客户端异常退出(无 session-end)且此后无事件到达时,事件路径的
  // purgeStaleSessions 永远不会被触发 → daemon 永久滞留;每小时执行一次,
  // 清理后会话集合为空由 resetIdleIfEmpty 衔接空闲退出
  setInterval(() => purgeStaleSessions(Date.now()), PURGE_MS);
  resetIdleIfEmpty();
});

async function handleEvent(event) {
  if (!event || typeof event !== 'object') return;
  const now = Date.now();
  // 本事件所属会话视为活跃,刷新 lastSeen(长会话不被误清理)
  if (event.sessionId) {
    const sess = sessions.get(event.sessionId);
    if (sess) sess.lastSeen = now;
  }
  // 会话过期清理(异常退出兜底):超过 SESSION_TTL_MS 未活跃的会话移除
  purgeStaleSessions(now);
  log('daemon', 'event', event.type, event.sessionId || '', event.cwd || '');
  if (event.type === 'session-start') {
    if (!event.sessionId) { log('daemon', 'session-start 缺 session_id,忽略'); return; } // 防 null 键锁死空闲退出
    // 会话启动时绑定窗口句柄(多会话各自绑定):
    // 1) 优先:进程目录匹配(Claude Code 动态终端标题不含项目名,2026-08-14 调研;
    //    WindowsTerminal 启动参数 -d "<cwd>" 是可靠信号,见 proc-dir.mjs)
    // 2) 次之:标题含 cwd 目录名(WindowsTerminal 默认标题含路径、VS Code 含文件夹名;
    //    进程白名单过滤,排除 explorer 误绑)
    // 3) 兜底:前台窗口同样规则
    let fgHwnd = 0;
    try {
      const eventCwd = event.cwd || '';
      const base = projectName(eventCwd).toLowerCase();
      const titleMatches = (w) => base && isWhitelistedProcess(w.processName)
        && String(w.title || '').toLowerCase().includes(base);
      const dirMatches = (w) => isWhitelistedProcess(w.processName)
        && commandLineMatchesCwd(w.commandLine, eventCwd);
      // 1) 枚举匹配:
      //    a) 目录信号限定进程(WindowsTerminal 多标签:进程级 -d 参数命中 cwd)
      //    b) 进程内优先选 '? ' 前缀标签(Claude Code 动态标题特征,2026-08-14 实测),
      //       避免误绑同进程的其他标签(cmd/其他 shell)
      //    c) 无 ? 标签时回退标题含项目名匹配
      const all = await runWin32('enumerate');
      const dirMatched = all.filter((w) => dirMatches(w));
      const ccTag = dirMatched.find((w) => /^\?\s/.test(w.title || ''));
      if (ccTag) {
        fgHwnd = ccTag.hwnd;
      } else if (dirMatched.length > 0) {
        fgHwnd = dirMatched[0].hwnd;
      }
      if (!fgHwnd) {
        for (const w of all) {
          if (titleMatches(w)) { fgHwnd = w.hwnd; break; }
        }
      }
      // 2) 前台兜底(同样双信号;前台窗口若是 Claude Code 标签直接采用)
      if (!fgHwnd) {
        const fg = await runWin32('foreground');
        if (fg && fg[0] && (dirMatches(fg[0]) || titleMatches(fg[0]) || /^\?\s/.test(fg[0].title || ''))) {
          fgHwnd = fg[0].hwnd;
        }
      }
    } catch { /* 桥接失败则 hwnd=0,回退标题映射 */ }
    sessions.set(event.sessionId, { cwd: event.cwd || '', lastSeen: Date.now(), hwnd: fgHwnd });
    log('daemon', 'session-start 绑定窗口 hwnd=' + fgHwnd, event.sessionId, 'cwd=' + (event.cwd || ''));
    resetIdleIfEmpty();
  }
  if (event.type === 'session-end') {
    sessions.delete(event.sessionId);
    resetIdleIfEmpty();
  }
  if (!NOTIFY_TYPES.has(event.type)) return;

  // 聚焦判定前保证映射表新鲜(为空或过期则刷新)
  if (windowMap.size === 0 || Date.now() - lastMapAt > POLL_MS) await pollWindows();
  const fg = await runWin32('foreground');
  const fgHwnd = fg && fg[0] ? fg[0].hwnd : 0;
  // 聚焦判定:1) 会话绑定窗口在前台(标题解析 miss 时仍可靠) 2) 窗口映射表(标题解析)
  const sessNow = event.sessionId ? sessions.get(event.sessionId) : null;
  const boundFocused = !!(sessNow && sessNow.hwnd && fgHwnd === sessNow.hwnd);
  const mappedFocused = decideFocus(fgHwnd, windowMap, event.cwd) === 'focused';
  if (boundFocused || mappedFocused) {
    log('daemon', '聚焦,静默', event.type, 'bound=' + (sessNow && sessNow.hwnd));
    return;
  }
  if (!deduper.shouldNotify(event.type)) {
    log('daemon', '去重跳过', event.type);
    return;
  }
  showToast(event);
}

// 会话过期清理:异常退出(无 session-end)的会话超过 TTL 未活跃则移除,防止会话集合
// 永久滞留导致空闲退出失效;正常路径仍由 session-end 显式删除,空闲退出逻辑不变
function purgeStaleSessions(now) {
  const cutoff = now - SESSION_TTL_MS;
  for (const [sid, sess] of sessions) {
    if (sess.lastSeen < cutoff) {
      log('daemon', '会话过期清理', sid);
      sessions.delete(sid);
    }
  }
  // 清空后衔接空闲退出:无论由事件路径还是周期定时器触发,清理后无剩余会话时
  // 重启空闲超时计时,滞留会话(异常退出且无新事件)不再让 daemon 永久滞留
  if (sessions.size === 0) resetIdleIfEmpty();
}

// in-flight 守卫:runWin32 桥接超时 10s 大于轮询周期 5s,轮询未完成时并发调用直接复用进行中的
// 同一次轮询(pollPromise),避免重入;handleEvent 的 await 也能拿到进行中轮询的结果
let pollPromise = null;
async function pollWindows() {
  if (pollPromise) return pollPromise;
  pollPromise = doPoll();
  try {
    return await pollPromise;
  } finally {
    pollPromise = null;
  }
}

async function doPoll() {
  const knownCwds = [...sessions.values()].map((s) => s.cwd);
  const entries = await runWin32('enumerate');
  windowMap = buildWindowMap(entries, knownCwds);
  lastMapAt = Date.now();
  log('daemon', '窗口映射', 'entries=' + entries.length, 'mapped=' + windowMap.size);
}

function showToast(event) {
  const { title, body } = toastContent(event);
  const cfg = loadConfig(event.cwd); // 与 notify-agent 一致:项目级配置(如 sound)也生效
  const target = normalizeCwd(event.cwd);
  // 优先用 SessionStart 绑定的会话窗口句柄(不依赖标题解析);无则回退窗口映射表
  let hwnd = 0;
  const sess = event.sessionId ? sessions.get(event.sessionId) : null;
  if (sess && sess.hwnd) hwnd = sess.hwnd;
  if (!hwnd) {
    for (const [h, c] of windowMap) {
      if (normalizeCwd(c) === target) { hwnd = Number(h); break; } // 会话窗口句柄
    }
  }
  // toast-agent.py:Python winrt 显示 Toast + 进程内 Activated 回调点击跳转(进程存活期间)
  const args = [TOAST, '-Title', title, '-Body', body];
  if (event.lang) args.push('-Lang', event.lang); // Toast XML lang 属性
  if (event.projectName) args.push('-Project', event.projectName);
  if (hwnd) args.push('-Hwnd', String(hwnd));
  if (cfg.sound === false) args.push('-nosound'); // sound:false → toast 静音
  log('daemon', 'toast', 'hwnd=' + hwnd, title, body);
  const child = spawn('python', args, { windowsHide: true });
  child.on('error', (err) => log('daemon', 'toast spawn 失败', err.message));
  child.on('exit', (code, signal) => log('daemon', 'toast exit', String(code), String(signal)));
}

function resetIdleIfEmpty() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (sessions.size > 0) return;
  idleTimer = setTimeout(() => {
    log('daemon', '空闲超时退出');
    clearState();
    process.exit(0);
  }, IDLE_MS);
}

process.on('exit', () => { // 进程退出时删除状态文件(仅当所有权属于本进程,防误删存活实例的状态)
  try {
    const s = readState();
    if (s && s.pid === process.pid) clearState();
  } catch { /* 忽略 */ }
});
