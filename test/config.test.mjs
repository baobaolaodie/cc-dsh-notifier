import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, DEFAULT_CONFIG, GLOBAL_DIR, GLOBAL_CONFIG, projectConfigPath, normalizeLanguage, parseLocaleName, resolveLanguage, detectSystemLanguage } from '../scripts/lib/config.mjs';

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ccn-config-')); }

test('默认配置', () => {
  assert.equal(DEFAULT_CONFIG.enabled, true);
  assert.equal(DEFAULT_CONFIG.dedupWindowMs, 10000);
  assert.equal(DEFAULT_CONFIG.sound, true);
  assert.equal(DEFAULT_CONFIG.language, 'auto');
  assert.equal(GLOBAL_CONFIG, path.join(GLOBAL_DIR, 'config.json'));
});

test('无任何配置文件时返回默认值', () => {
  const dir = tmpDir();
  const cfg = loadConfig(path.join(dir, 'proj'), { globalConfig: path.join(dir, 'missing.json') });
  assert.deepEqual(cfg, { enabled: true, dedupWindowMs: 10000, sound: true, language: 'auto' });
});

test('normalizeLanguage:只认 zh/en,其余回退 auto', () => {
  assert.equal(normalizeLanguage('zh'), 'zh');
  assert.equal(normalizeLanguage('en'), 'en');
  assert.equal(normalizeLanguage('auto'), 'auto');
  assert.equal(normalizeLanguage('fr'), 'auto');
  assert.equal(normalizeLanguage(undefined), 'auto');
  assert.equal(normalizeLanguage(null), 'auto');
});

test('parseLocaleName:zh-*/en-* 映射,其余/无法解析为 null', () => {
  assert.equal(parseLocaleName('    LocaleName    REG_SZ    zh-CN'), 'zh');
  assert.equal(parseLocaleName('    LocaleName    REG_SZ    en-US'), 'en');
  assert.equal(parseLocaleName('    LocaleName    REG_SZ    fr-FR'), null); // 不引入第三种语言
  assert.equal(parseLocaleName(''), null);
  assert.equal(parseLocaleName('no match here'), null);
  assert.equal(parseLocaleName(null), null);
});

test('resolveLanguage:zh/en 直取,auto/未知走系统检测', () => {
  assert.equal(resolveLanguage({ language: 'zh' }), 'zh');
  assert.equal(resolveLanguage({ language: 'en' }), 'en');
  // auto:win32 真跑 reg(zh-CN/en-US),非 win32 reg 不存在 → 回退 en;两者都 ∈ {zh,en}
  assert.ok(['zh', 'en'].includes(resolveLanguage({ language: 'auto' })));
  assert.ok(['zh', 'en'].includes(resolveLanguage({})));
  assert.ok(['zh', 'en'].includes(resolveLanguage(null)));
});

test('detectSystemLanguage:失败/未知语言回退 en,zh/en 直取(注入 exec 确定性验证)', () => {
  assert.equal(detectSystemLanguage(() => { throw new Error('no reg'); }), 'en'); // 查询失败 → en
  assert.equal(detectSystemLanguage(() => '    LocaleName    REG_SZ    fr-FR'), 'en'); // 未知语言 → en
  assert.equal(detectSystemLanguage(() => '    LocaleName    REG_SZ    en-US'), 'en');
  assert.equal(detectSystemLanguage(() => '    LocaleName    REG_SZ    zh-CN'), 'zh');
  assert.equal(detectSystemLanguage(() => ''), 'en'); // 空输出 → en
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

test('language 项目级覆盖:项目级 en 生效,非法值回退 auto', () => {
  const dir = tmpDir();
  const g = path.join(dir, 'global.json');
  fs.writeFileSync(g, JSON.stringify({ language: 'zh' })); // 全局 zh
  const proj = path.join(dir, 'proj');
  fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.claude', 'cc-notifier.json'), JSON.stringify({ language: 'en' }));
  assert.equal(resolveLanguage(loadConfig(proj, { globalConfig: g })), 'en'); // 项目级覆盖全局
  fs.writeFileSync(path.join(proj, '.claude', 'cc-notifier.json'), JSON.stringify({ language: 'xx' }));
  // 非法值 → normalizeLanguage 回退 auto → 系统检测(平台相关,恒 ∈ {zh,en})
  assert.ok(['zh', 'en'].includes(resolveLanguage(loadConfig(proj, { globalConfig: g }))));
});

test('损坏 JSON 回退默认', () => {
  const dir = tmpDir();
  const g = path.join(dir, 'global.json');
  fs.writeFileSync(g, '{bad json');
  const cfg = loadConfig(null, { globalConfig: g });
  assert.equal(cfg.enabled, true);
});

test('projectConfigPath 拼接正确', () => {
  // 平台无关:期望值由 path.join 动态构造(输入混用反斜杠在非 win32 会保留)
  const expected = path.join('D:\\proj', '.claude', 'cc-notifier.json');
  assert.equal(projectConfigPath('D:\\proj'), expected);
  assert.equal(projectConfigPath(''), null);
});
