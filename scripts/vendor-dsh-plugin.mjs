#!/usr/bin/env node
// vendor-dsh-plugin — 把 cc-notifier 运行时同步进 dsh-notifier 发布包。
// 插件发布形态必须自包含(pnpm pack 后独立于仓库运行),因此把 daemon/toast-agent/
// win32 桥/共享库/图标 复制到 plugins/dsh-notifier/lib/runtime/。
// - daemon.mjs 与 toast-agent.py 内部全部使用相对引用,复制后自动适配
// - 幂等:每次全量复制;pretest(prepack 前置)保证测试与打包前 runtime 最新
// - runtime/ 为生成物(gitignore),不入库
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_LIB = path.join(ROOT, 'scripts', 'lib');
const RUNTIME = path.join(ROOT, 'plugins', 'dsh-notifier', 'lib', 'runtime');

// 复制的共享库(全部 .mjs + win32.ps1 + 图标 + .cs 源码)
const LIB_FILES = [
  'events.mjs', 'config.mjs', 'dedup.mjs', 'focus.mjs', 'window-map.mjs',
  'state.mjs', 'logger.mjs', 'win32.mjs', 'proc-dir.mjs', 'daemon-core.mjs',
  'win32.ps1',
  'foreground.cs', 'activate-tab.cs',
  'notifier-icon.png', 'claude-icon.png',
];
// 编译产物若存在则一并复制(不存在时 toast-agent 会现场用 .cs 编译)
const EXE_FILES = ['foreground.exe', 'activate-tab.exe'];

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// 清空并重建 runtime(幂等全量同步,防残留旧文件)
fs.rmSync(RUNTIME, { recursive: true, force: true });
fs.mkdirSync(path.join(RUNTIME, 'lib'), { recursive: true });

copy(path.join(ROOT, 'scripts', 'daemon.mjs'), path.join(RUNTIME, 'daemon.mjs'));
copy(path.join(ROOT, 'scripts', 'toast-agent.py'), path.join(RUNTIME, 'toast-agent.py'));

let count = 0;
for (const f of LIB_FILES) {
  const src = path.join(SRC_LIB, f);
  if (!fs.existsSync(src)) {
    console.warn('vendor: 缺失 ' + f + ',跳过');
    continue;
  }
  copy(src, path.join(RUNTIME, 'lib', f));
  count += 1;
}
for (const f of EXE_FILES) {
  const src = path.join(SRC_LIB, f);
  if (fs.existsSync(src)) {
    copy(src, path.join(RUNTIME, 'lib', f));
    count += 1;
  }
}
console.log(`vendor: dsh-notifier runtime 同步完成(${count} 个文件 → plugins/dsh-notifier/lib/runtime/)`);
