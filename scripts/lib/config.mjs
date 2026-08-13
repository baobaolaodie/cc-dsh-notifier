// 配置:全局 ~/.cc-notifier/config.json + 项目级 .claude/cc-notifier.json(项目级优先)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const GLOBAL_DIR = path.join(os.homedir(), '.cc-notifier');
export const GLOBAL_CONFIG = path.join(GLOBAL_DIR, 'config.json');
export const DEFAULT_CONFIG = { enabled: true, dedupWindowMs: 10000, sound: true };

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
