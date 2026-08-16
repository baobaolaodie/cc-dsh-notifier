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
  // PostToolUse(tool-result)已移除:工具出错不再通知(2026-08-16 用户决策)
  ['Stop', 'stop', ''],
  ['SessionEnd', 'session-end', ''],
];

function commandFor(event) {
  return `node ${JSON.stringify(AGENT)} ${event}`;
}

// Python + winrt 包检测(toast-agent.py 的运行时依赖;不自动安装,仅提示)。
// 检测与运行时保持一致:把解析出的解释器绝对路径写入全局配置 pythonPath,
// daemon/notify-agent 固定用它 spawn —— 裸 `python` 依赖宿主 PATH,不同启动上下文
// 会解析到不同解释器(2026-08-16 实测:宿主重启后 PATH 变化,daemon 的 python 缺 winrt,
// Toast 启动即崩);绝对路径与宿主 PATH 无关。
function checkPython() {
  // 探测模块与 toast-agent.py 实际 import 一致(winrt.windows.ui.notifications + winrt.windows.data.xml.dom)
  const winrtProbe = 'import winrt.windows.ui.notifications, winrt.windows.data.xml.dom';
  let pythonPath = 'python';
  try {
    execFileSync('python', ['--version'], { stdio: 'ignore' });
    // Windows 用 where 解析绝对路径(首个命中);失败则保持裸 python
    try {
      const resolved = execFileSync('where', ['python'], { encoding: 'utf8' })
        .split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (resolved) pythonPath = resolved;
    } catch { /* 保持裸 python */ }
  } catch (err) {
    console.warn('未检测到 Python:Toast 通知依赖 Python 3 + winrt 包(scripts/toast-agent.py)。 / Python not detected: toasts require Python 3 + the winrt packages (scripts/toast-agent.py).');
    console.warn('请先安装 Python 3(https://www.python.org)后再使用通知功能;未安装不影响 Claude Code 会话本身。 / Install Python 3 first; Claude Code sessions work regardless.');
    return;
  }
  try {
    execFileSync(pythonPath, ['-c', winrtProbe], { stdio: 'ignore' });
    writePythonPath(pythonPath);
    console.log('Python 与 winrt 包可用(' + pythonPath + ')。 / Python and the winrt packages are available (' + pythonPath + ').');
  } catch (err) {
    console.warn('检测到 Python,但缺少 winrt 包。请手动安装: / Python found, but the winrt packages are missing. Install manually:');
    console.warn('  pip install winrt-runtime winrt-Windows.UI.Notifications winrt-Windows.Data.Xml.Dom winrt-Windows.Foundation');
  }
}

// 把 pythonPath 合并进全局配置(保留既有键;不破坏未知键)
function writePythonPath(pythonPath) {
  try {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
    let cfg = {};
    if (fs.existsSync(GLOBAL_CONFIG)) {
      try { cfg = JSON.parse(fs.readFileSync(GLOBAL_CONFIG, 'utf8')); } catch { cfg = {}; }
    }
    cfg.pythonPath = pythonPath;
    fs.writeFileSync(GLOBAL_CONFIG, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  } catch (err) {
    console.warn('写入 pythonPath 到配置失败:', err.message, '/ failed to write pythonPath to config:', err.message);
  }
}

// AUMID 注册(幂等,重复执行无副作用)
function registerAumid() {
  try {
    execFileSync('reg', ['add', AUMID, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'cc-notifier', '/f'], { stdio: 'ignore' });
    execFileSync('reg', ['add', AUMID, '/v', 'IconUri', '/t', 'REG_SZ', '/d', ICON_URI, '/f'], { stdio: 'ignore' });
    console.log('AUMID 已注册(Toast 显示前提):', AUMID, '/ AUMID registered (required for toasts):', AUMID);
  } catch (err) {
    console.warn('AUMID 注册失败,Toast 可能无法显示:', err.message, '/ AUMID registration failed, toasts may not display:', err.message);
  }
}

function main() {
  checkPython();

  let settings = {};
  if (fs.existsSync(SETTINGS)) {
    if (!fs.existsSync(BACKUP)) {
      fs.copyFileSync(SETTINGS, BACKUP); // 先备份,防合并破坏用户配置
      console.log('已备份 settings.json →', BACKUP, '/ settings.json backed up →', BACKUP);
    }
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    } catch (err) {
      console.error('settings.json 解析失败:', err.message, '/ settings.json parse failed: ' + err.message);
      process.exit(1);
    }
  }
  settings.hooks = settings.hooks || {};
  for (const [hookName, event, matcher] of HOOKS) {
    const list = settings.hooks[hookName] || (settings.hooks[hookName] = []);
    const present = list.some((entry) =>
      entry && entry.hooks && entry.hooks.some((h) => h.command && h.command.includes('notify-agent.mjs')));
    if (present) {
      console.log(`跳过(已注入): ${hookName} / skipped (already injected): ${hookName}`);
      continue;
    }
    const entry = { hooks: [{ type: 'command', command: commandFor(event) }] };
    if (matcher) entry.matcher = matcher;
    list.push(entry);
    console.log(`注入: ${hookName} → ${commandFor(event)} / injected: ${hookName} → ${commandFor(event)}`);
  }
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');

  registerAumid();

  if (!fs.existsSync(GLOBAL_CONFIG)) {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
    fs.writeFileSync(GLOBAL_CONFIG, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    console.log('生成默认配置:', GLOBAL_CONFIG, '/ wrote default config: ' + GLOBAL_CONFIG);
  }
  console.log('安装完成。新开 Claude Code 会话后生效。 / Install complete. Takes effect in new Claude Code sessions.');
}

main();
