#!/usr/bin/env node
// 安装:备份并合并 ~/.claude/settings.json,注入 hooks;注册 AUMID(Toast 显示前提);
// 检测 Python + winrt 依赖(仅提示,不自动安装);生成默认配置 ~/.cc-notifier/config.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GLOBAL_DIR, GLOBAL_CONFIG, DEFAULT_CONFIG } from './lib/config.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const BACKUP = SETTINGS + '.cc-notifier.bak';
const AGENT = path.join(ROOT, 'scripts', 'notify-agent.mjs');

// AUMID 注册:Toast 显示前提(toast-agent.py 用 create_toast_notifier_with_id('cc-notifier') 显示)
const AUMID = 'HKCU\\Software\\Classes\\AppUserModelId\\cc-notifier';
const ICON_URI = 'C:\\Windows\\System32\\notepad.exe,0'; // 系统内置图标,可自行替换为任意 .ico 路径

const HOOKS = [
  ['SessionStart', 'session-start', ''],
  ['PermissionRequest', 'permission-request', ''],
  ['PreToolUse', 'ask-user-question', 'AskUserQuestion'],
  ['PostToolUse', 'tool-result', ''],
  ['Stop', 'stop', ''],
  ['SessionEnd', 'session-end', ''],
];

function commandFor(event) {
  return `node ${JSON.stringify(AGENT)} ${event}`;
}

// Python + winrt 包检测(toast-agent.py 的运行时依赖;不自动安装,仅提示)
// 只认 python 命令:notify-agent.mjs/daemon.mjs 固定 spawn('python'),检测与运行时保持一致,避免「检测通过但运行时失败」
function checkPython() {
  // 探测模块与 toast-agent.py 实际 import 一致(winrt.windows.ui.notifications + winrt.windows.data.xml.dom)
  const winrtProbe = 'import winrt.windows.ui.notifications, winrt.windows.data.xml.dom';
  try {
    execFileSync('python', ['--version'], { stdio: 'ignore' });
  } catch (err) {
    console.warn('未检测到 Python:Toast 通知依赖 Python 3 + winrt 包(scripts/toast-agent.py)。');
    console.warn('请先安装 Python 3(https://www.python.org)后再使用通知功能;未安装不影响 Claude Code 会话本身。');
    return;
  }
  try {
    execFileSync('python', ['-c', winrtProbe], { stdio: 'ignore' });
    console.log('Python 与 winrt 包可用(python)。');
  } catch (err) {
    console.warn('检测到 Python,但缺少 winrt 包。请手动安装:');
    console.warn('  pip install winrt-runtime winrt-Windows.UI.Notifications winrt-Windows.Data.Xml.Dom winrt-Windows.Foundation');
  }
}

// AUMID 注册(幂等,重复执行无副作用)
function registerAumid() {
  try {
    execFileSync('reg', ['add', AUMID, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'cc-notifier', '/f'], { stdio: 'ignore' });
    execFileSync('reg', ['add', AUMID, '/v', 'IconUri', '/t', 'REG_SZ', '/d', ICON_URI, '/f'], { stdio: 'ignore' });
    console.log('AUMID 已注册(Toast 显示前提):', AUMID);
  } catch (err) {
    console.warn('AUMID 注册失败,Toast 可能无法显示:', err.message);
  }
}

function main() {
  checkPython();

  let settings = {};
  if (fs.existsSync(SETTINGS)) {
    if (!fs.existsSync(BACKUP)) {
      fs.copyFileSync(SETTINGS, BACKUP); // 先备份,防合并破坏用户配置
      console.log('已备份 settings.json →', BACKUP);
    }
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    } catch (err) {
      console.error('settings.json 解析失败:', err.message);
      process.exit(1);
    }
  }
  settings.hooks = settings.hooks || {};
  for (const [hookName, event, matcher] of HOOKS) {
    const list = settings.hooks[hookName] || (settings.hooks[hookName] = []);
    const present = list.some((entry) =>
      entry && entry.hooks && entry.hooks.some((h) => h.command && h.command.includes('notify-agent.mjs')));
    if (present) {
      console.log(`跳过(已注入): ${hookName}`);
      continue;
    }
    const entry = { hooks: [{ type: 'command', command: commandFor(event) }] };
    if (matcher) entry.matcher = matcher;
    list.push(entry);
    console.log(`注入: ${hookName} → ${commandFor(event)}`);
  }
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');

  registerAumid();

  if (!fs.existsSync(GLOBAL_CONFIG)) {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
    fs.writeFileSync(GLOBAL_CONFIG, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    console.log('生成默认配置:', GLOBAL_CONFIG);
  }
  console.log('安装完成。新开 Claude Code 会话后生效。');
}

main();
