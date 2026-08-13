import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, DEFAULT_CONFIG, GLOBAL_DIR, GLOBAL_CONFIG, projectConfigPath } from '../scripts/lib/config.mjs';

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ccn-config-')); }

test('默认配置', () => {
  assert.equal(DEFAULT_CONFIG.enabled, true);
  assert.equal(DEFAULT_CONFIG.dedupWindowMs, 10000);
  assert.equal(DEFAULT_CONFIG.sound, true);
  assert.equal(GLOBAL_CONFIG, path.join(GLOBAL_DIR, 'config.json'));
});

test('无任何配置文件时返回默认值', () => {
  const dir = tmpDir();
  const cfg = loadConfig(path.join(dir, 'proj'), { globalConfig: path.join(dir, 'missing.json') });
  assert.deepEqual(cfg, { enabled: true, dedupWindowMs: 10000, sound: true });
});

test('全局配置覆盖默认', () => {
  const dir = tmpDir();
  const g = path.join(dir, 'global.json');
  fs.writeFileSync(g, JSON.stringify({ sound: false }));
  const cfg = loadConfig(null, { globalConfig: g });
  assert.equal(cfg.sound, false);
  assert.equal(cfg.enabled, true);
});

test('项目级覆盖优先于全局', () => {
  const dir = tmpDir();
  const g = path.join(dir, 'global.json');
  fs.writeFileSync(g, JSON.stringify({ enabled: true, dedupWindowMs: 5000 }));
  const proj = path.join(dir, 'proj');
  fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.claude', 'cc-notifier.json'), JSON.stringify({ enabled: false }));
  const cfg = loadConfig(proj, { globalConfig: g });
  assert.equal(cfg.enabled, false); // 项目级优先
  assert.equal(cfg.dedupWindowMs, 5000); // 未覆盖字段继承全局
});

test('损坏 JSON 回退默认', () => {
  const dir = tmpDir();
  const g = path.join(dir, 'global.json');
  fs.writeFileSync(g, '{bad json');
  const cfg = loadConfig(null, { globalConfig: g });
  assert.equal(cfg.enabled, true);
});

test('projectConfigPath 拼接正确', () => {
  // 平台无关:path.join 输出由平台决定(win32 反斜杠、其他平台正斜杠)
  const expected = process.platform === 'win32'
    ? 'D:\\proj\\.claude\\cc-notifier.json'
    : 'D:/proj/.claude/cc-notifier.json';
  assert.equal(projectConfigPath('D:\\proj'), expected);
  assert.equal(projectConfigPath(''), null);
});
