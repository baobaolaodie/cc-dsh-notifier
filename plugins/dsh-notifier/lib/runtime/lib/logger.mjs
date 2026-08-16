// 日志:%LOCALAPPDATA%\cc-notifier\<name>.log;超 1MB 保留尾部 64KB 截断
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './state.mjs';

const MAX_LOG = 1024 * 1024;

export function log(name, ...parts) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, `${name}.log`);
    try {
      if (fs.statSync(file).size > MAX_LOG) {
        const tail = fs.readFileSync(file, 'utf8').slice(-65536);
        fs.writeFileSync(file, tail);
      }
    } catch { /* 首次写入 */ }
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${parts.join(' ')}\n`);
  } catch { /* 日志失败绝不抛 */ }
}
