// 窗口标题 → cwd 解析、进程白名单、构建 hwnd→cwd 映射表
import { normalizeCwd, projectName } from './events.mjs';

export const PROCESS_WHITELIST = new Set([
  'WindowsTerminal.exe', 'Code.exe', 'cmd.exe', 'pwsh.exe', 'powershell.exe', 'conhost.exe',
]);

// 真实进程名不带 .exe(如 WindowsTerminal),这里补全后与白名单比较
export function isWhitelistedProcess(processName) {
  if (!processName) return false;
  const key = processName.toLowerCase().endsWith('.exe') ? processName : `${processName}.exe`;
  return PROCESS_WHITELIST.has(key);
}

const WIN_PATH_RE = /[A-Za-z]:[\\/][^\s|,;'"`()]+/g;

export function titleToCwd(title, knownCwds = []) {
  if (!title) return null;
  // 规则 1:取标题中最后一个 Windows 路径段
  const matches = String(title).match(WIN_PATH_RE);
  if (matches && matches.length > 0) {
    const cand = matches[matches.length - 1].replace(/[\\/]+$/, '');
    const norm = normalizeCwd(cand);
    for (const cwd of knownCwds) {
      if (normalizeCwd(cwd) === norm) return cwd; // 命中已知会话 cwd,返回原值
    }
    return cand; // 未知路径也返回候选(映射表仍可用,聚焦判定比较归一化值)
  }
  // 规则 2:无路径段时,标题单词匹配已知 cwd 的 basename(如 VS Code "cc-notifier - Visual Studio Code")
  const words = String(title).toLowerCase().split(/[^a-z0-9._-]+/i).filter(Boolean);
  for (const cwd of knownCwds) {
    const base = projectName(cwd).toLowerCase();
    if (base && words.includes(base)) return cwd;
  }
  // 规则 3(Spike ② 定稿):Claude Code 会话终端标题(如 "? Claude Code")不含任何路径信息;
  // 仅当 knownCwds 恰有一个时映射到该 cwd,多个会话时无法区分 → MISS(宁打扰勿漏)
  if (knownCwds.length === 1) {
    const stripped = String(title).replace(/^[^A-Za-z0-9]+/, '').trim();
    if (/^claude code$/i.test(stripped)) return knownCwds[0];
  }
  return null;
}

export function buildWindowMap(entries, knownCwds = []) {
  const map = new Map();
  for (const e of entries) {
    if (!isWhitelistedProcess(e.processName)) continue;
    const cwd = titleToCwd(e.title, knownCwds);
    if (cwd) map.set(String(e.hwnd), cwd);
  }
  return map;
}
