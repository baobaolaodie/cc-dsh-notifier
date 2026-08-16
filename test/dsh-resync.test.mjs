// daemon 重启检测单元测试:pid 变化触发一次回调;重复调用不重复触发;daemon 不在不触发
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDaemonResync } from '../plugins/dsh-notifier/lib/resync.mjs';

test('daemon pid 变化 → 触发一次 onNewDaemon;重复调用不重复触发', () => {
  let state = { pid: 100, port: 1 };
  const seen = [];
  const check = createDaemonResync({
    readState: () => state,
    isPidAlive: () => true,
    onNewDaemon: (pid) => seen.push(pid),
  });
  assert.equal(check(), true);
  assert.equal(check(), false); // 同一 pid 不重复
  assert.deepEqual(seen, [100]);
  // daemon 重启(pid 变化)
  state = { pid: 200, port: 2 };
  assert.equal(check(), true);
  assert.deepEqual(seen, [100, 200]);
});

test('daemon 不在(无状态/pid 死)→ 不触发', () => {
  const seen = [];
  let state = null;
  const check = createDaemonResync({
    readState: () => state,
    isPidAlive: () => false,
    onNewDaemon: (pid) => seen.push(pid),
  });
  assert.equal(check(), false);
  state = { pid: 300, port: 3 };
  assert.equal(check(), false); // pid 死 → 不当作新 daemon
  assert.deepEqual(seen, []);
});

test('首次调用时 daemon 已在跑 → 触发(插件启动后立即同步现有 daemon)', () => {
  const seen = [];
  const check = createDaemonResync({
    readState: () => ({ pid: 400, port: 4 }),
    isPidAlive: () => true,
    onNewDaemon: (pid) => seen.push(pid),
  });
  assert.equal(check(), true);
  assert.deepEqual(seen, [400]);
});
