// 单实例状态:daemon.json({port, pid, startedAt})原子读写 + pid 存活探测
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DATA_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'cc-notifier',
);
export const STATE_FILE = path.join(DATA_DIR, 'daemon.json');

export function readState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (raw && typeof raw === 'object' && Number.isFinite(raw.port) && Number.isFinite(raw.pid)) {
      return { port: raw.port, pid: raw.pid, startedAt: raw.startedAt || 0 };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeState({ port, pid }) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ port, pid, startedAt: Date.now() }));
  fs.renameSync(tmp, STATE_FILE); // 原子替换
}

export function clearState() {
  try { fs.unlinkSync(STATE_FILE); } catch { /* 不存在即可 */ }
}

export function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
