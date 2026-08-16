// dsh-notifier 转发器集成测试:daemon 存活/不在时的转发与拉起行为
// (「启动智能」:任何通知事件都拉起 daemon,失败才降级 fallback)
// 用伪 daemon(fixtures/fake-daemon.mjs)验证真实 spawn + HTTP 转发链路
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccn-fwd-'));
const stateFile = path.join(tmp, 'daemon.json');
const eventLog = path.join(tmp, 'events.jsonl');
const fakeDaemon = fileURLToPath(new URL('./fixtures/fake-daemon.mjs', import.meta.url));

// 环境必须在模块加载前设置(forwarder 的 STATE_FILE/DAEMON 是加载期常量)
process.env.CCN_STATE_FILE = stateFile;
process.env.CCN_DAEMON_PATH = fakeDaemon;
process.env.CCN_EVENT_LOG = eventLog;

const { forward } = await import('../plugins/dsh-notifier/lib/forwarder.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readEvents() {
  try {
    return fs.readFileSync(eventLog, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  } catch { return []; }
}

test('daemon 存活:事件直接转发,不重复 spawn', async () => {
  fs.rmSync(stateFile, { force: true });
  fs.rmSync(eventLog, { force: true });
  // 先启动伪 daemon(模拟存活实例)
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, [fakeDaemon], { detached: true, stdio: 'ignore' });
  child.unref();
  // 等伪 daemon 就绪
  for (let i = 0; i < 50; i += 1) {
    if (fs.existsSync(stateFile)) break;
    await sleep(100);
  }
  assert.ok(fs.existsSync(stateFile), '伪 daemon 应写入状态文件');

  await forward({ type: 'approval/asked', sessionId: 's1', cwd: 'D:\\w', toolName: 'pwsh', summary: 'x' });
  await sleep(300); // 等 HTTP 落地
  const events = readEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'approval/asked');
  assert.equal(events[0].sessionId, 's1');
  // 清理伪 daemon
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  try { process.kill(state.pid); } catch { /* 已退出 */ }
  fs.rmSync(stateFile, { force: true });
});

test('daemon 不在:通知事件也拉起 daemon 并转发(启动智能,不再走 fallback)', async () => {
  fs.rmSync(stateFile, { force: true });
  fs.rmSync(eventLog, { force: true });
  // 无状态文件 → forward 应 spawn 伪 daemon + 等待就绪 + 转发
  await forward({ type: 'approval/asked', sessionId: 's2', cwd: 'D:\\w', toolName: 'pwsh', summary: 'y' });
  // 等 spawn 的伪 daemon 就绪并收到事件
  let events = [];
  for (let i = 0; i < 50; i += 1) {
    events = readEvents();
    if (events.length > 0) break;
    await sleep(100);
  }
  assert.ok(events.length >= 1, '事件应被转发到新拉起的 daemon');
  assert.equal(events[0].sessionId, 's2');
  // 清理
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    try { process.kill(state.pid); } catch { /* 已退出 */ }
  }
  fs.rmSync(stateFile, { force: true });
});

test('daemon 不在:session-end 直接丢弃,不 spawn', async () => {
  fs.rmSync(stateFile, { force: true });
  fs.rmSync(eventLog, { force: true });
  await forward({ type: 'session-end', sessionId: 's3' });
  await sleep(400);
  assert.equal(fs.existsSync(stateFile), false, 'session-end 不应拉起 daemon');
  assert.equal(readEvents().length, 0);
});
