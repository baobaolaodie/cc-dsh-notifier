import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideFocus } from '../scripts/lib/focus.mjs';

const map = new Map([['100', 'D:\\proj\\a'], ['200', 'D:\\proj\\b']]);

test('前台窗口映射命中且 cwd 相等 → 聚焦', () => {
  assert.equal(decideFocus(100, map, 'D:\\proj\\a'), 'focused');
});

test('大小写与尾部斜杠归一化后相等 → 聚焦', () => {
  // win32 小写化后相等;其他平台不区分大小写路径比较不适用,仅 win32 断言
  if (process.platform === 'win32') {
    assert.equal(decideFocus(100, map, 'd:\\PROJ\\a\\'), 'focused');
  }
});

test('映射命中但 cwd 不同 → 失焦', () => {
  assert.equal(decideFocus(200, map, 'D:\\proj\\a'), 'unfocused');
});

test('映射缺失 → 失焦(宁打扰勿漏)', () => {
  assert.equal(decideFocus(999, map, 'D:\\proj\\a'), 'unfocused');
  assert.equal(decideFocus(0, new Map(), 'D:\\proj\\a'), 'unfocused');
});
