import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeduper } from '../scripts/lib/dedup.mjs';

test('首次通知通过', () => {
  const d = createDeduper(10000);
  assert.equal(d.shouldNotify('permission-request'), true);
});

test('同类型窗口内合并(后续事件更新最后时间,不弹窗)', () => {
  const d = createDeduper(10000);
  d.shouldNotify('stop');
  assert.equal(d.shouldNotify('stop'), false);
  assert.equal(d.shouldNotify('stop'), false);
});

test('不同类型互不影响', () => {
  const d = createDeduper(10000);
  d.shouldNotify('stop');
  assert.equal(d.shouldNotify('ask-user-question'), true);
});

test('窗口过期后重新通知', async () => {
  const d = createDeduper(50);
  d.shouldNotify('stop');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(d.shouldNotify('stop'), true);
});
