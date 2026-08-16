// 配置:全局 ~/.cc-notifier/config.json + 项目级 .claude/cc-notifier.json(项目级优先)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const GLOBAL_DIR = path.join(os.homedir(), '.cc-notifier');
export const GLOBAL_CONFIG = path.join(GLOBAL_DIR, 'config.json');
// language: 'auto'(按系统显示语言)| 'zh' | 'en';缺省 auto,未知语言回退 en
// windowWhitelist:浏览器窗口白名单(dsh web surface 会话绑定/聚焦用,如 chrome.exe/msedge.exe);
// 缺省空 = 无浏览器绑定(web 会话 hwnd=0,聚焦判定走窗口映射表 → 宁打扰勿漏)
// pollIntervalMs:daemon 窗口轮询周期(ms),默认 10000;每次轮询 spawn PowerShell(1.6-1.8s),
// dsh 常驻后该开销 7×24 存在,间隔越大后台占用越低(聚焦判定有缓存快路径兜底)
// dedupWindowMs:通知去重窗口(ms),默认 0 = 不去重。前置前提是「失焦才通知」——
// 聚焦时静默、失焦时每条都该通知(2026-08-16 用户决策:放开去重,多会话同类型不被吞;
// 同日决策:移除等待输入交互抑制——由 daemon 聚焦判定负责「在看→静默,切走→弹」)
// pythonPath:toast-agent 解释器绝对路径(install.mjs 检测时写入)。裸 `python` 依赖宿主 PATH,
// 不同启动上下文可能解析到不同解释器(2026-08-16 实测:宿主重启后 PATH 变化,daemon 的
// python 缺 winrt → Toast 启动即崩);固定绝对路径后与宿主 PATH 无关
export const DEFAULT_CONFIG = { enabled: true, dedupWindowMs: 0, sound: true, language: 'auto', windowWhitelist: [], pollIntervalMs: 10000, pythonPath: '' };

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
// execImpl 可注入(测试用),生产默认 execFileSync
export function detectSystemLanguage(execImpl = execFileSync) {
  try {
    const out = execImpl('reg', ['query', 'HKCU\\Control Panel\\International', '/v', 'LocaleName'], { encoding: 'utf8' });
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
