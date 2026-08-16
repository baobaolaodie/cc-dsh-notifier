// daemon 代码变更自我重启端到端测试:
// 启动真实 daemon(隔离 LOCALAPPDATA)→ 触碰 lib 文件 mtime → 等待 daemon 检测并换新进程
// (2026-08-16 用户反馈「新建会话不换 daemon」:单实例 daemon 只有死亡才被拉起,
// 本机制让代码变更后 daemon 自动换新,无需手动杀/误导性重启)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const daemonPath = fileURLToPath(new URL('../scripts/daemon.mjs', import.meta.url));
const libCore = fileURLToPath(new URL('../scripts/lib/daemon-core.mjs', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('代码变更 → daemon 自我重启(pid 变化)', { timeout: 45000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccn-restart-'));
  const env = { ...process.env, LOCALAPPDATA: path.join(tmp, 'AppData', 'Local') };
  const stateFile = path.join(env.LOCALAPPDATA, 'cc-notifier', 'daemon.json');
  const daemon = spawn(process.execPath, [daemonPath], { env, stdio: 'ignore', windowsHide: true });
  daemon.unref();

  // 等初始 daemon 就绪
  let pid1 = 0;
  for (let i = 0; i < 50; i += 1) {
    try { pid1 = JSON.parse(fs.readFileSync(stateFile, 'utf8')).pid; break; } catch { await sleep(100); }
  }
  assert.ok(pid1 > 0, '初始 daemon 应就绪');
  // 竞态防护(2026-08-16 实测):daemon 启动回调内 writeState 先于 watchSelfRestart 基线捕获,
  // 若 touch 落在这两个步骤之间(状态文件已出现但基线未捕获),变更将永远检测不到。
  // 等 300ms 确保 daemon 完整启动(含基线捕获)后再触碰。
  await sleep(300);

  // 触碰代码文件 mtime(仅改时间戳,不改内容)
  const orig = fs.statSync(libCore).mtimeMs;
  const t = new Date();
  fs.utimesSync(libCore, t, t);

  // 等自我重启(监控每 10s 一轮;等待 30s = 3 个周期,覆盖 tick 相位抖动)
  let pid2 = 0;
  for (let i = 0; i < 300; i += 1) {
    try {
      pid2 = JSON.parse(fs.readFileSync(stateFile, 'utf8')).pid;
      if (pid2 !== pid1) break;
    } catch { /* 状态文件在重启间隙可能被清空 */ }
    await sleep(100);
  }
  assert.notEqual(pid2, pid1, '代码变更后 daemon 应重启为新 pid');

  // 清理:杀新 daemon,恢复文件 mtime
  try { process.kill(pid2); } catch { /* 已退出 */ }
  fs.utimesSync(libCore, new Date(orig), new Date(orig));
  fs.rmSync(tmp, { recursive: true, force: true });
});
