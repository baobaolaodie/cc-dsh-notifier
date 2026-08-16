// daemon 核心状态机单元测试:会话表/聚焦判定/去重/空闲退出/宿主存活/TTL 清理
// 全部依赖注入 fake(win32 桥/前台/Toast/定时器),确定性、无真实弹窗
// 注意:daemon 收到的是规范化事件类型(permission-request 等,非 dsh 原始事件名)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDaemonCore } from '../scripts/lib/daemon-core.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeCtx(overrides = {}) {
  const calls = { showToast: 0, toasts: [] };
  return {
    bindWindow: overrides.bindWindow || (async () => 100),
    getForeground: overrides.getForeground || (async () => ({ hwnd: 200 })),
    getWindowMap: overrides.getWindowMap || (async () => new Map()),
    showToast: overrides.showToast || (async (e) => { calls.showToast += 1; calls.toasts.push(e); }),
    calls,
  };
}

function makeCore(cfg = {}, extra = {}) {
  const state = { idleFired: 0 };
  const core = createDaemonCore({
    config: { dedupWindowMs: 0, ...cfg },
    isPidAlive: extra.isPidAlive || (() => true),
    log: extra.log || (() => {}),
    now: extra.now || Date.now,
    idleMs: 20,
    onIdle: () => { state.idleFired += 1; },
    ...extra,
  });
  return { core, state };
}

const ev = (type, overrides = {}) => ({ type, sessionId: 's1', cwd: 'D:\\w', ...overrides });

test('session-start:注册会话(surface/hostPid 存储,bindWindow 被调)', async () => {
  const { core } = makeCore();
  const ctx = makeCtx();
  const r = await core.handleEvent(ev('session-start', { surface: 'web', hostPid: 42 }), ctx);
  assert.equal(r, 'registered');
  const s = core.sessions.get('s1');
  assert.equal(s.surface, 'web');
  assert.equal(s.hostPid, 42);
  assert.equal(s.hwnd, 100);
});

test('session-start 缺 sessionId → ignored(防 null 键锁死空闲退出)', async () => {
  const { core } = makeCore();
  assert.equal(await core.handleEvent({ type: 'session-start' }, makeCtx()), 'ignored');
  assert.equal(core.sessions.size, 0);
});

test('session-start 绑定抛错仍注册,hwnd=0(不阻塞会话)', async () => {
  const { core } = makeCore();
  const ctx = makeCtx({ bindWindow: async () => { throw new Error('bridge down'); } });
  assert.equal(await core.handleEvent(ev('session-start'), ctx), 'registered');
  assert.equal(core.sessions.get('s1').hwnd, 0);
});

test('默认 surface=claude(Claude Code 事件无 surface 字段)', async () => {
  const { core } = makeCore();
  await core.handleEvent(ev('session-start'), makeCtx());
  assert.equal(core.sessions.get('s1').surface, 'claude');
});

test('聚焦判定:绑定窗口在前台 → silent-focused,不弹 Toast', async () => {
  const { core } = makeCore();
  const ctx = makeCtx({ getForeground: async () => ({ hwnd: 100 }) }); // 100 = 绑定窗口
  await core.handleEvent(ev('session-start'), makeCtx());
  const r = await core.handleEvent(ev('permission-request'), ctx);
  assert.equal(r, 'silent-focused');
  assert.equal(ctx.calls.showToast, 0);
});

test('聚焦判定:映射表命中(cwd 相等)→ silent-focused', async () => {
  const { core } = makeCore();
  const ctx = makeCtx({
    getForeground: async () => ({ hwnd: 300 }),
    getWindowMap: async () => new Map([['300', 'D:\\w']]),
  });
  await core.handleEvent(ev('session-start'), makeCtx());
  const r = await core.handleEvent(ev('permission-request'), ctx);
  assert.equal(r, 'silent-focused');
});

test('聚焦判定:失焦(实时前台非绑定窗口)→ toast,立即弹', async () => {
  const { core } = makeCore();
  const ctx = makeCtx({ getForeground: async () => ({ hwnd: 999 }) }); // 已切走
  await core.handleEvent(ev('session-start'), makeCtx());
  const r = await core.handleEvent(ev('permission-request'), ctx);
  assert.equal(r, 'toast');
  assert.equal(ctx.calls.showToast, 1);
  assert.equal(ctx.calls.toasts[0].type, 'permission-request');
});

test('聚焦判定使用事件到达时的实时前台:切走后立即判定失焦(无假静默)', async () => {
  const { core } = makeCore();
  const ctx = makeCtx({ getForeground: async () => ({ hwnd: 999 }) });
  await core.handleEvent(ev('session-start'), makeCtx());
  const r = await core.handleEvent(ev('permission-request'), ctx);
  assert.equal(r, 'toast');
});

test('浏览器兜底:会话未绑定(daemon 重启场景)+ 前台=白名单浏览器含 dsh 标题 → silent-focused', async () => {
  // 2026-08-16 用户实测「聚焦也弹」:daemon 重启后会话表为空,绑定/映射双双失效,
  // 本兜底保证:前台是白名单浏览器且标题含 DeepSeek Harness → 视为聚焦
  const { core } = makeCore({}, { browserWhitelist: ['msedge.exe'] });
  const ctx = makeCtx({
    getForeground: async () => ({ hwnd: 700, processName: 'msedge', title: '仔细研究这个repo给dsh做适配 — DeepSeek Harness — 个人 — Microsoft Edge' }),
  });
  // 无 session-start!会话表为空(模拟 daemon 重启后绑定丢失)
  const r = await core.handleEvent(ev('permission-request'), ctx);
  assert.equal(r, 'silent-focused');
  assert.equal(ctx.calls.showToast, 0);
});

test('浏览器兜底:前台=浏览器但标题不含 dsh(在看其他网站)→ 照常通知,不误静默', async () => {
  const { core } = makeCore({}, { browserWhitelist: ['msedge.exe'] });
  const ctx = makeCtx({
    getForeground: async () => ({ hwnd: 700, processName: 'msedge', title: 'B站 - 哔哩哔哩' }),
  });
  const r = await core.handleEvent(ev('permission-request'), ctx);
  assert.equal(r, 'toast');
  assert.equal(ctx.calls.showToast, 1);
});

test('浏览器兜底:前台=非白名单进程(不在浏览器名单)→ 不适用兜底,正常判定', async () => {
  const { core } = makeCore({}, { browserWhitelist: ['msedge.exe'] });
  const ctx = makeCtx({
    getForeground: async () => ({ hwnd: 700, processName: 'notepad', title: 'xx — DeepSeek Harness' }),
  });
  const r = await core.handleEvent(ev('permission-request'), ctx);
  assert.equal(r, 'toast');
});

test('web 会话 + 同窗口切走(句柄不变但标题不含 dsh,如 dsh tab → GitHub tab)→ 照常通知(假静默回归防护)', async () => {
  // 2026-08-16 用户实测「toast 又不触发了」:窗口句柄是窗口级而非 tab 级,
  // 同一 Edge 窗口内切 tab 句柄不变 → 旧逻辑 boundFocused 误判聚焦 → 假静默
  const { core } = makeCore({}, { browserWhitelist: ['msedge.exe'] });
  // web 会话绑定 hwnd=700;前台=同一窗口(700)但标题是 GitHub(活动 tab 已切走)
  await core.handleEvent(ev('session-start', { surface: 'web' }), makeCtx({ bindWindow: async () => 700 }));
  const ctx = makeCtx({
    getForeground: async () => ({ hwnd: 700, processName: 'msedge', title: 'cc-notifier/CONTRIBUTING-zh.md at master · baobaolaodie/cc-notifier 和另外 11 个页面 - 个人 - Microsoft Edge' }),
  });
  const r = await core.handleEvent(ev('permission-request'), ctx);
  assert.equal(r, 'toast');
  assert.equal(ctx.calls.showToast, 1);
});

test('web 会话 + 同一窗口内回到 dsh tab(标题含 DeepSeek Harness)→ 静默', async () => {
  const { core } = makeCore({}, { browserWhitelist: ['msedge.exe'] });
  await core.handleEvent(ev('session-start', { surface: 'web' }), makeCtx({ bindWindow: async () => 700 }));
  const ctx = makeCtx({
    getForeground: async () => ({ hwnd: 700, processName: 'msedge', title: '仔细研究这个repo给dsh做适配 — DeepSeek Harness - 内存使用率 - 个人 - Microsoft Edge' }),
  });
  const r = await core.handleEvent(ev('permission-request'), ctx);
  assert.equal(r, 'silent-focused');
  assert.equal(ctx.calls.showToast, 0);
});

test('终端类(claude)会话:窗口句柄匹配仍生效(终端窗口即会话窗口)', async () => {
  const { core } = makeCore({}, { browserWhitelist: ['msedge.exe'] });
  await core.handleEvent(ev('session-start'), makeCtx({ bindWindow: async () => 500 })); // 默认 surface=claude
  const ctx = makeCtx({
    getForeground: async () => ({ hwnd: 500, processName: 'Code', title: 'Claude Code - flow-comet - Visual Studio Code' }),
  });
  const r = await core.handleEvent(ev('permission-request'), ctx);
  assert.equal(r, 'silent-focused');
});

test('非通知类型 → noop,不弹', async () => {
  const { core } = makeCore();
  const ctx = makeCtx();
  await core.handleEvent(ev('session-start'), makeCtx());
  assert.equal(await core.handleEvent(ev('user/message'), ctx), 'noop');
  assert.equal(ctx.calls.showToast, 0);
});

test('去重关闭(dedupWindowMs=0,默认):多会话同类型各自弹', async () => {
  const { core } = makeCore();
  const ctx = makeCtx();
  await core.handleEvent(ev('session-start', { sessionId: 'A' }), makeCtx());
  await core.handleEvent(ev('session-start', { sessionId: 'B' }), makeCtx());
  assert.equal(await core.handleEvent(ev('permission-request', { sessionId: 'A' }), ctx), 'toast');
  assert.equal(await core.handleEvent(ev('permission-request', { sessionId: 'B' }), ctx), 'toast');
  assert.equal(ctx.calls.showToast, 2);
});

test('去重开启:同会话同类型窗口内合并,不同会话独立', async () => {
  const { core } = makeCore({ dedupWindowMs: 10000 });
  const ctx = makeCtx();
  await core.handleEvent(ev('session-start', { sessionId: 'A' }), makeCtx());
  await core.handleEvent(ev('session-start', { sessionId: 'B' }), makeCtx());
  assert.equal(await core.handleEvent(ev('permission-request', { sessionId: 'A' }), ctx), 'toast');
  assert.equal(await core.handleEvent(ev('permission-request', { sessionId: 'A' }), ctx), 'silent-dedup');
  assert.equal(await core.handleEvent(ev('permission-request', { sessionId: 'B' }), ctx), 'toast'); // 另一会话不受影响
  assert.equal(ctx.calls.showToast, 2);
});

test('session-end 注销会话', async () => {
  const { core } = makeCore();
  await core.handleEvent(ev('session-start'), makeCtx());
  assert.equal(await core.handleEvent(ev('session-end'), makeCtx()), 'unregistered');
  assert.equal(core.sessions.size, 0);
});

test('空闲退出:会话清空后 idleMs 内触发 onIdle', async () => {
  const { core, state } = makeCore();
  await core.handleEvent(ev('session-start'), makeCtx());
  await core.handleEvent(ev('session-end'), makeCtx());
  assert.equal(state.idleFired, 0);
  await sleep(50);
  assert.equal(state.idleFired, 1);
});

test('空闲退出:有会话时不退出', async () => {
  const { core, state } = makeCore();
  await core.handleEvent(ev('session-start'), makeCtx());
  await sleep(50);
  assert.equal(state.idleFired, 0);
});

test('宿主存活清理:hostPid 死亡 → 会话删除;全部死亡后空闲退出', async () => {
  const alive = new Set([11]);
  const { core, state } = makeCore({}, { isPidAlive: (p) => alive.has(p) });
  await core.handleEvent(ev('session-start', { sessionId: 'live', hostPid: 11 }), makeCtx());
  await core.handleEvent(ev('session-start', { sessionId: 'dead', hostPid: 99 }), makeCtx());
  core.checkHostLiveness();
  assert.equal(core.sessions.has('dead'), false);
  assert.equal(core.sessions.has('live'), true);
  alive.delete(11);
  core.checkHostLiveness();
  assert.equal(core.sessions.size, 0);
  await sleep(50);
  assert.equal(state.idleFired, 1);
});

test('TTL 过期清理:超过 12h 未活跃的会话移除', async () => {
  let t = 1000;
  const { core } = makeCore({}, { now: () => t, idleMs: 20 });
  await core.handleEvent(ev('session-start'), makeCtx());
  t = 1000 + 12 * 60 * 60 * 1000 + 1;
  core.purgeStaleSessions();
  assert.equal(core.sessions.size, 0);
});

test('会话活跃刷新:事件到达刷新 lastSeen,不误清理', async () => {
  let t = 1000;
  const { core } = makeCore({}, { now: () => t, idleMs: 20 });
  await core.handleEvent(ev('session-start'), makeCtx());
  t = 1000 + 12 * 60 * 60 * 1000; // 恰好 TTL 边界
  await core.handleEvent(ev('permission-request'), makeCtx()); // 刷新 lastSeen
  core.purgeStaleSessions();
  assert.equal(core.sessions.size, 1); // 未被清理
});
