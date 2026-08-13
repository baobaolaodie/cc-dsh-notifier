#!/usr/bin/env node
// 安装 pre-commit 钩子:提交前自动运行本地检查(npm test + 双语镜像 + BOM 防线)
// 用法:node scripts/install-commit-hook.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOOK = path.join(ROOT, '.git', 'hooks', 'pre-commit');

const HOOK_BODY = `#!/bin/sh
# cc-notifier pre-commit:本地检查(CI 服务端兜底)
set -e
cd "$(git rev-parse --show-toplevel)"

echo "=== [pre-commit] 单元测试 / npm test ==="
npm test

echo "=== [pre-commit] 双语镜像对称 / Bilingual mirror ==="
node -e "
const fs = require('fs');
const pairs = [['README.md','README-zh.md'],['CONTRIBUTING.md','CONTRIBUTING-zh.md'],
               ['SECURITY.md','SECURITY-zh.md'],['CHANGELOG.md','CHANGELOG-zh.md'],
               ['docs/INSTALLATION.md','docs/INSTALLATION-zh.md'],
               ['docs/USAGE.md','docs/USAGE-zh.md'],
               ['docs/TROUBLESHOOTING.md','docs/TROUBLESHOOTING-zh.md']];
for (const [en, zh] of pairs) {
  const ne = fs.readFileSync(en, 'utf8').split('\\n').length;
  const nz = fs.readFileSync(zh, 'utf8').split('\\n').length;
  if (Math.abs(ne - nz) > 10) {
    console.error('双语镜像不对称 / asymmetry: ' + en + ' ' + ne + ' vs ' + zh + ' ' + nz);
    process.exit(1);
  }
}
console.log('7 bilingual pairs OK');
"

echo "=== [pre-commit] BOM 防线 / BOM guard ==="
node -e "
const fs = require('fs');
const buf = fs.readFileSync('scripts/lib/win32.ps1');
const hasBom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
if (!hasBom) { console.error('win32.ps1 缺少 UTF-8 BOM(PS 5.1 必需)'); process.exit(1); }
console.log('win32.ps1 BOM OK');
"
`;

function main() {
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.error('未找到 .git 目录(不是 git 仓库?)');
    process.exit(1);
  }
  fs.writeFileSync(HOOK, HOOK_BODY, 'utf8');
  fs.chmodSync(HOOK, 0o755);
  console.log('pre-commit 钩子已安装:', HOOK);
  console.log('提交前将自动运行:npm test + 双语镜像检查 + BOM 检查');
}

main();
