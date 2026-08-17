#!/usr/bin/env node
// 常驻进程入口:单实例、本地随机端口 HTTP、窗口轮询、CDP 发现、Toast 触发。
// 会话/聚焦/去重/生命周期决策逻辑在 lib/daemon-core.mjs(可注入依赖,有单元测试)。
import http from 'node:http';
import fs from 'node:fs';
import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toastContent, normalizeCwd, projectName } from './lib/events.mjs';
import { loadConfig } from './lib/config.mjs';
import { readState, writeState, clearState, isPidAlive } from './lib/state.mjs';
import { log } from './lib/logger.mjs';
import { runWin32, pickConsoleTarget } from './lib/win32.mjs';
import { buildWindowMap, isWhitelistedProcess, PROCESS_WHITELIST } from './lib/window-map.mjs';
import { commandLineMatchesCwd } from './lib/proc-dir.mjs';
import { createDaemonCore } from './lib/daemon-core.mjs';

const TOAST = fileURLToPath(new URL('./toast-agent.py', import.meta.url));
const FG_EXE = fileURLToPath(new URL('./lib/foreground.exe', import.meta.url));

const baseCfg = loadConfig(null);
// 窗口映射轮询周期:默认 10s(可配置 pollIntervalMs)。轮询每次 spawn PowerShell(1.6-1.8s),
// dsh 适配后 daemon 常驻 7×24,间隔越大后台占用越低
const POLL_MS = Math.max(2000, Number(baseCfg.pollIntervalMs) || 10000);
const PURGE_MS = 60 * 60 * 1000; // 会话周期清理间隔(兜底)
const HOST_LIVENESS_MS = 30 * 1000; // 宿主存活探测间隔

// 终端白名单(Claude Code / dsh-tui 会话绑定):内置进程表;
// 浏览器白名单(web surface 会话绑定):配置 windowWhitelist(如 chrome.exe/msedge.exe)
const TERMINAL_WHITELIST = PROCESS_WHITELIST;
const BROWSER_WHITELIST = new Set(Array.isArray(baseCfg.windowWhitelist) ? baseCfg.windowWhitelist : []);
const BROWSER_NAMES = [...BROWSER_WHITELIST].map((n) => String(n).replace(/\.exe$/i, '')).filter(Boolean).join(',');

// CDP 端口发现与缓存:web surface 的 toast 点击需精确激活 dsh tab(而非整窗)。
const CDP_TTL_MS = 5 * 60 * 1000;
let cdpPort = 0;
let cdpPortAt = 0;

function parseCdpPort(entries) {
  for (const w of entries || []) {
    if (!isWhitelistedProcess(w.processName, BROWSER_WHITELIST)) continue;
    const m = /--remote-debugging-port=(\d+)/.exec(w.commandLine || '');
    if (m) return Number(m[1]);
  }
  return 0;
}

async function getCdpPort(hint) {
  const t = Date.now();
  if (cdpPort && t - cdpPortAt < CDP_TTL_MS) return cdpPort;
  const entries = (hint && hint.length) ? hint : await runWin32('enumerate', 10000, BROWSER_NAMES);
  cdpPort = parseCdpPort(entries);
  cdpPortAt = Date.now();
  return cdpPort;
}

// 预编译前台窗口查询器(~150ms,替代 PowerShell 1.6-1.8s):
// 聚焦判定用事件到达时的实时前台,不用缓存(缓存 ≤10s 陈旧会造成假静默);
// exe 缺失/失败时回退 PowerShell 桥
function foregroundHwnd() {
  return new Promise((resolve) => {
    execFile(FG_EXE, [], { encoding: 'utf8', timeout: 3000, windowsHide: true }, (err, stdout) => {
      if (!err && stdout) {
        try {
          const d = JSON.parse(stdout);
          if (d && Number.isFinite(d.hwnd)) return resolve(d);
        } catch { /* 解析失败走回退 */ }
      }
      runWin32('foreground').then((fg) => resolve(fg && fg[0] ? fg[0] : null));
    });
  });
}

// 新鲜缓存枚举/前台(≤POLL_MS)或现场查询:host 启动时 session-start 突发
// 若每个都现场 spawn PowerShell 会形成 20-35s 风暴;突发绑定用同一份新鲜数据即可
let lastEntries = [];
let cachedForegroundWin = null;
let cachedForegroundAt = 0;
let lastMapAt = 0;
let pollPromise = null;
let windowMap = new Map(); // hwnd(String) → cwd

async function freshEntries() {
  return (lastEntries.length && Date.now() - lastMapAt <= POLL_MS) ? lastEntries : await runWin32('enumerate');
}
async function freshForeground() {
  return (cachedForegroundAt && Date.now() - cachedForegroundAt <= POLL_MS && cachedForegroundWin)
    ? [cachedForegroundWin]
    : [await foregroundHwnd()];
}

async function pollWindows() {
  if (pollPromise) return pollPromise;
  pollPromise = doPoll();
  try { return await pollPromise; } finally { pollPromise = null; }
}

async function doPoll() {
  const knownCwds = [...core.sessions.values()].map((s) => s.cwd);
  const data = await runWin32('poll'); // 一次调用取窗口表 + 前台窗口
  const entries = (data[0] && Array.isArray(data[0].entries)) ? data[0].entries : [];
  lastEntries = entries;
  cachedForegroundWin = (data[0] && data[0].foreground) || null;
  cachedForegroundAt = Date.now();
  windowMap = buildWindowMap(entries, knownCwds, TERMINAL_WHITELIST);
  lastMapAt = Date.now();
  // web 会话窗口句柄刷新:浏览器窗口句柄会随浏览器重启失效,用最新枚举按标题对齐
  if (BROWSER_WHITELIST.size > 0) {
    for (const sess of core.sessions.values()) {
      if (sess.surface !== 'web') continue;
      const hit = entries.find((w) => isWhitelistedProcess(w.processName, BROWSER_WHITELIST)
        && /deepseek harness/i.test(w.title || ''));
      if (hit && hit.hwnd !== sess.hwnd) {
        log('daemon', 'web 会话窗口句柄刷新', sess.cwd, String(sess.hwnd) + '→' + hit.hwnd);
        sess.hwnd = hit.hwnd;
      }
    }
  }
  log('daemon', '窗口映射', 'entries=' + entries.length, 'mapped=' + windowMap.size);
}
// dsh-tui 独立终端精确绑定:按 dsh host 进程 pid 找出其所在控制台窗口
// (Windows Terminal 的 PseudoConsoleWindow 可见且 owner 是标签窗口;VSCode 集成终端
// 的 PseudoConsoleWindow 不可见 → pickConsoleTarget 返回 0,继续走原有标题/目录绑定)
async function consoleTargetForPid(pid) {
  if (!pid) return 0;
  const data = await runWin32('console-hwnd', 10000, '', ['-TargetPid', String(pid)]);
  return pickConsoleTarget(Array.isArray(data) ? data[0] : data);
}

// 会话启动窗口绑定(web:浏览器窗口;tui/Claude Code:终端窗口)
async function bindWindow(event) {
  const eventCwd = event.cwd || '';
  if (event.surface === 'web') {
    // web surface(dsh 浏览器 UI):绑定浏览器窗口。
    // dsh 页面标题恒含 "DeepSeek Harness";兜底:前台窗口若是浏览器直接采用
    const all = await freshEntries();
    const isBrowser = (w) => isWhitelistedProcess(w.processName, BROWSER_WHITELIST);
    const hit = all.find((w) => isBrowser(w) && /deepseek harness/i.test(w.title || ''));
    if (hit) return hit.hwnd;
    const fg = await freshForeground();
    if (fg && fg[0] && isBrowser(fg[0])) return fg[0].hwnd;
    getCdpPort().catch(() => {}); // 预取 CDP 端口(后台)
    return 0;
  }
  // dsh-tui / Claude Code 独立终端:优先用 hostPid 精确定位控制台/标签窗口;
  // VSCode 集成终端返回不可见 PseudoConsoleWindow → pickConsoleTarget 返回 0,
  // 继续向下走目录/标题匹配(Claude Code 不再依赖全局 `?` 猜测,2026-08-18)
  if (event.surface !== 'web' && event.hostPid) {
    const target = await consoleTargetForPid(event.hostPid);
    if (target) return target;
  }
  // tui surface / Claude Code(无 surface 字段):终端窗口绑定。
  // 1) 优先:进程目录匹配(WindowsTerminal -d "<cwd>" 是可靠信号)
  // 2) 次之:标题含 cwd 目录名(白名单进程过滤)
  // 3) 兜底:前台窗口同样规则
  const base = projectName(eventCwd).toLowerCase();
  const titleMatches = (w) => base && isWhitelistedProcess(w.processName, TERMINAL_WHITELIST)
    && String(w.title || '').toLowerCase().includes(base);
  const dirMatches = (w) => isWhitelistedProcess(w.processName, TERMINAL_WHITELIST)
    && commandLineMatchesCwd(w.commandLine, eventCwd);
  const all = await freshEntries();
  const dirMatched = all.filter((w) => dirMatches(w));
  // ? 前缀标签是 Claude Code 动态标题特征(如「? 策划 deepseek-harness-tui 视频介绍」),
  // **仅对 Claude Code 会话**(无 surface 或 surface=claude)生效——dsh-tui 事件带
  // surface=tui,窗口标题是「DeepSeek - 项目」,若也匹配 ? 标签会误绑到 CC 的窗口
  // (2026-08-16 实测:全局 ? 匹配把 dsh-tui 会话绑到了 CC 的 Windows Terminal)。
  // 2026-08-16 用户实测修复:CC 跑在 Windows Terminal 独立终端(无 -d、标题不含项目名),
  // ? 标签匹配从 dirMatched 子集提升为全局(独立终端场景)。
  const isClaude = !event.surface || event.surface === 'claude';
  const ccTagDir = isClaude ? dirMatched.find((w) => /^\?\s/.test(w.title || '')) : undefined;
  if (ccTagDir) return ccTagDir.hwnd;
  // 先按标题含项目名精确命中(VSCode 等窗口标题可靠包含项目名);
  // 再退到全局 ? 前缀(独立 Windows Terminal 的 Claude Code 动态标题),
  // 避免 VSCode 里的 Claude Code 被全局 ? 误绑到其他终端标签(2026-08-18 回归)
  for (const w of all) {
    if (titleMatches(w)) return w.hwnd;
  }
  const ccTagAny = isClaude ? all.find((w) => /^\?\s/.test(w.title || '')) : undefined;
  if (ccTagAny) return ccTagAny.hwnd;
  if (dirMatched.length > 0) return dirMatched[0].hwnd;
  const fg = await freshForeground();
  if (fg && fg[0] && (dirMatches(fg[0]) || titleMatches(fg[0]) || (isClaude && /^\?\s/.test(fg[0].title || '')))) {
    return fg[0].hwnd;
  }
  return 0;
}

async function showToast(event) {
  const { title, body } = toastContent(event);
  const cfg = loadConfig(event.cwd); // 与 notify-agent 一致:项目级配置(如 sound)也生效
  const target = normalizeCwd(event.cwd);
  const sess = event.sessionId ? core.sessions.get(event.sessionId) : null;
  const surface = event.surface || (sess && sess.surface) || 'claude'; // claude=Claude Code
  // 优先用 SessionStart 绑定的会话窗口句柄;web 会话兜底:从最近枚举找浏览器窗口
  // (覆盖 daemon 重启后会话表为空 / 浏览器重启句柄失效)
  let hwnd = 0;
  if (sess && sess.hwnd) hwnd = sess.hwnd;
  if (!hwnd && surface === 'web' && BROWSER_WHITELIST.size > 0) {
    const hit = lastEntries.find((w) => isWhitelistedProcess(w.processName, BROWSER_WHITELIST)
      && /deepseek harness/i.test(w.title || ''));
    if (hit) hwnd = hit.hwnd;
  }
  // 懒绑定兜底(2026-08-18):SessionStart 绑定失败或 daemon 重启后会话表已丢失时,
  // 用会话/事件自带的 hostPid 精确定位控制台/标签窗口,恢复 Toast 点击跳转(dsh-tui 与 Claude Code)
  if (!hwnd && surface !== 'web') {
    const hostPid = (sess && sess.hostPid) || event.hostPid;
    if (hostPid) hwnd = await consoleTargetForPid(hostPid);
  }
  // 懒绑定优先用窗口映射(cwd 精确匹配,覆盖 VSCode 窗口标题);再退到 Claude Code
  // 的 ? 动态标签(独立 Windows Terminal 场景),避免 VSCode CC 被全局 ? 误绑(2026-08-18 回归)
  if (!hwnd) {
    for (const [h, c] of windowMap) {
      if (normalizeCwd(c) === target) { hwnd = Number(h); break; }
    }
  }
  if (!hwnd && surface === 'claude') {
    const hit = lastEntries.find((w) => isWhitelistedProcess(w.processName, TERMINAL_WHITELIST)
      && /^\?\s/.test(w.title || ''));
    if (hit) hwnd = hit.hwnd;
  }
  const args = [TOAST, '-Title', title, '-Body', body];
  if (event.lang) args.push('-Lang', event.lang);
  if (event.projectName) args.push('-Project', event.projectName);
  if (event.sessionTitle) args.push('-SessionTitle', event.sessionTitle);
  if (surface) args.push('-Surface', surface);
  if (hwnd) args.push('-Hwnd', String(hwnd));
  if (surface === 'web') {
    try {
      const port = await getCdpPort();
      if (port) args.push('-CdpPort', String(port));
    } catch { /* CDP 不可用则 UIA/整窗跳转 */ }
  }
  if (cfg.sound === false) args.push('-nosound');
  log('daemon', 'toast', 'hwnd=' + hwnd, title, body);
  // 解释器固定用配置的绝对路径(2026-08-16:裸 python 依赖宿主 PATH,重启后可能解析到
  // 无 winrt 的解释器 → Toast 启动即崩;pythonPath 为空时回退裸 python 保持兼容)
  const py = cfg.pythonPath || 'python';
  let child;
  try {
    child = spawn(py, args, { windowsHide: true });
  } catch (err) { // 同步 spawn 失败(受限环境 EPERM 等)不崩溃,记录后返回
    log('daemon', 'toast spawn 失败', err.message);
    return;
  }
  child.on('error', (err) => log('daemon', 'toast spawn 失败', err.message));
  child.on('exit', (code, signal) => log('daemon', 'toast exit', String(code), String(signal)));
  child.stderr.on('data', (d) => log('daemon', 'toast stderr', String(d).slice(0, 500)));
}

// 核心状态机(会话/聚焦/去重/生命周期);真实依赖在此注入
const core = createDaemonCore({
  config: baseCfg,
  isPidAlive,
  log,
  browserWhitelist: [...BROWSER_WHITELIST],
  onIdle: () => { clearState(); process.exit(0); },
});

// 事件处理上下文:核心只依赖这些能力(测试用 fake 注入)
const ctx = {
  bindWindow,
  getForeground: foregroundHwnd,
  getWindowMap: async () => {
    if (windowMap.size === 0 || Date.now() - lastMapAt > POLL_MS) await pollWindows();
    return windowMap;
  },
  showToast,
};

// 单实例锁:已有存活实例则退出。pid 存活但端口无 HTTP 响应 = 残留状态
async function existingDaemonAlive(existing) {
  if (!isPidAlive(existing.pid)) return false;
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: existing.port, path: '/', method: 'GET', timeout: 1000 },
      (res) => { res.resume(); res.on('end', () => resolve(true)); },
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
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
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    let event = {};
    try { event = JSON.parse(body || '{}'); } catch (err) { log('daemon', 'event JSON 解析失败', err.message); return; }
    core.handleEvent(event, ctx).catch((err) => log('daemon', 'handleEvent 异步异常', err && err.message || String(err)));
  });
  req.on('error', () => {});
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  writeState({ port, pid: process.pid });
  const check = readState();
  if (!check || check.pid !== process.pid) {
    log('daemon', '状态文件被其他实例覆盖,退出');
    process.exit(0);
  }
  log('daemon', '启动 port=' + port, 'pid=' + process.pid);
  pollWindows().catch(() => {}); // 轮询失败(win32 桥异常)不崩溃,后续定时器继续重试
  setInterval(pollWindows, POLL_MS);
  setInterval(() => core.purgeStaleSessions(), PURGE_MS);
  setInterval(() => core.checkHostLiveness(), HOST_LIVENESS_MS);
  core.resetIdleIfEmpty();
  watchSelfRestart();
});

// 代码变更自我重启(2026-08-16 用户反馈「新建会话不换 daemon」):
// daemon 是单实例,只有死亡才被新事件拉起;本监控检测自身与 lib/*.mjs 的 mtime 变化,
// 变更后清理状态 → spawn 新实例 → 退出。此后改代码无需手动杀 daemon 或误导性重启。
function watchSelfRestart() {
  const self = fileURLToPath(new URL('./daemon.mjs', import.meta.url));
  const libDir = fileURLToPath(new URL('./lib/', import.meta.url));
  const watchFiles = () => {
    const names = [self, ...fs.readdirSync(libDir).filter((f) => f.endsWith('.mjs')).map((f) => path.join(libDir, f))];
    return names.map((f) => ({ f, m: fs.statSync(f).mtimeMs }));
  };
  let baseline;
  try { baseline = watchFiles(); } catch { log('daemon', '自我重启监控不可用(读文件失败)'); return; }
  log('daemon', '自我重启监控就绪(' + baseline.length + ' 文件)');
  setInterval(() => {
    let changed = false;
    try {
      const nowList = watchFiles();
      if (nowList.length !== baseline.length) changed = true;
      else for (let i = 0; i < nowList.length; i += 1) if (nowList[i].m !== baseline[i].m) { changed = true; break; }
    } catch { return; }
    if (changed) {
      log('daemon', '代码变更,自我重启');
      try { clearState(); } catch { /* 忽略 */ }
      const child = spawn(process.execPath, [self], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      process.exit(0);
    }
  }, 10000);
}

process.on('exit', () => { // 退出时删除状态文件(仅当所有权属于本进程)
  try {
    const s = readState();
    if (s && s.pid === process.pid) clearState();
  } catch { /* 忽略 */ }
});
