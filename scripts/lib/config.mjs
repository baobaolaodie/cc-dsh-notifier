// 配置:全局 ~/.cc-notifier/config.json + 项目级 .claude/cc-notifier.json(项目级优先)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const GLOBAL_DIR = path.join(os.homedir(), '.cc-notifier');
export const GLOBAL_CONFIG = path.join(GLOBAL_DIR, 'config.json');
// language: 'auto'(按系统显示语言)| 'zh' | 'en';缺省 auto,未知语言回退 zh(与旧行为一致)
export const DEFAULT_CONFIG = { enabled: true, dedupWindowMs: 10000, sound: true, language: 'auto' };

export function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function projectConfigPath(cwd) {
  return cwd ? path.join(cwd, '.claude', 'cc-notifier.json') : null;
}

// overrides 仅测试注入用;生产调用 loadConfig(cwd)
export function loadConfig(cwd, overrides = {}) {
  const cfg = { ...DEFAULT_CONFIG };
  const global = readJsonSafe(overrides.globalConfig || GLOBAL_CONFIG);
  if (global && typeof global === 'object' && !Array.isArray(global)) Object.assign(cfg, global);
  const projFile = overrides.projectConfig || projectConfigPath(cwd);
  const proj = projFile ? readJsonSafe(projFile) : null;
  if (proj && typeof proj === 'object' && !Array.isArray(proj)) Object.assign(cfg, proj); // 项目级优先级最高
  return cfg;
}

// 规范化 language 配置:只认 'zh' | 'en',其余一律 'auto'
export function normalizeLanguage(lang) {
  return lang === 'zh' || lang === 'en' ? lang : 'auto';
}

// 从 reg query 输出解析显示语言:zh-* → 'zh',en-* → 'en',无法解析 → null
export function parseLocaleName(raw) {
  const m = /LocaleName\s+REG_SZ\s+(\S+)/i.exec(raw || '');
  if (!m) return null;
  const code = m[1].toLowerCase();
  if (code.startsWith('zh')) return 'zh';
  if (code.startsWith('en')) return 'en';
  return null;
}

// 系统显示语言检测:reg query HKCU\Control Panel\International /v LocaleName
// 查询失败/未知语言 → 回退 'en'(项目英文主版;中文系统检测 zh-CN 仍得 zh,不受影响)
export function detectSystemLanguage() {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Control Panel\\International', '/v', 'LocaleName'], { encoding: 'utf8' });
    return parseLocaleName(out) || 'en';
  } catch {
    return 'en';
  }
}

// 解析最终通知语言:auto → 系统检测;zh/en 直取
export function resolveLanguage(cfg) {
  const lang = normalizeLanguage(cfg && cfg.language);
  return lang === 'auto' ? detectSystemLanguage() : lang;
}
