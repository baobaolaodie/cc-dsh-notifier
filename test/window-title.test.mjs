import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleToCwd, buildWindowMap, PROCESS_WHITELIST, isWhitelistedProcess } from '../scripts/lib/window-map.mjs';

const CWD = 'D:\\LongYinHaHa\\VSCode\\cc-notifier';

test('Windows Terminal 标题含路径(取最后一个路径段)', () => {
  assert.equal(titleToCwd('bash — 80x24 D:\\LongYinHaHa\\VSCode\\cc-notifier', [CWD]), CWD);
});

test('标题直接是路径', () => {
  assert.equal(titleToCwd('D:\\LongYinHaHa\\VSCode\\cc-notifier', [CWD]), CWD);
});

test('已知 cwd 以 basename 出现在标题(VS Code 风格)', () => {
  assert.equal(titleToCwd('cc-notifier - Visual Studio Code', [CWD]), CWD);
});

test('中文路径标题', () => {
  assert.equal(titleToCwd('D:\\项目\\测试目录 — cmd', []), 'D:\\项目\\测试目录');
});

test('未知标题(记事本)无匹配 → null', () => {
  assert.equal(titleToCwd('untitled - Notepad', [CWD]), null);
  assert.equal(titleToCwd('', [CWD]), null);
});

test('buildWindowMap:白名单过滤 + 键为字符串 hwnd', () => {
  const entries = [
    { hwnd: 1, pid: 1, title: CWD, processName: 'WindowsTerminal.exe' },
    { hwnd: 2, pid: 2, title: '随便', processName: 'notepad.exe' },
    { hwnd: 3, pid: 3, title: 'cc-notifier - Visual Studio Code', processName: 'Code.exe' },
  ];
  const map = buildWindowMap(entries, [CWD]);
  assert.equal(map.size, 2);
  assert.equal(map.get('1'), CWD);
  assert.equal(map.get('3'), CWD);
  assert.equal(PROCESS_WHITELIST.has('WindowsTerminal.exe'), true);
  assert.equal(PROCESS_WHITELIST.has('notepad.exe'), false);
});

test('Spike ② 定稿:Claude Code 会话终端标题(唯一 known cwd)→ 命中', () => {
  // 真实环境 Windows Terminal 标题为 "? Claude Code",无路径信息
  assert.equal(titleToCwd('? Claude Code', [CWD]), CWD);
  assert.equal(titleToCwd('Claude Code', [CWD]), CWD);
});

test('Spike ② 定稿:Claude Code 标题但 known cwd 多个 → 无法区分返回 null', () => {
  assert.equal(titleToCwd('? Claude Code', [CWD, 'D:\\proj\\other']), null);
});

test('Spike ② 定稿:带项目名的 VS Code 标题(非唯一会话)不适用规则 3 → null', () => {
  assert.equal(titleToCwd('Claude Code - flow-comet - Visual Studio Code', [CWD]), null);
});

test('Spike ② 定稿:真实进程名不带 .exe 也通过白名单', () => {
  assert.equal(isWhitelistedProcess('WindowsTerminal'), true);
  assert.equal(isWhitelistedProcess('WindowsTerminal.exe'), true);
  assert.equal(isWhitelistedProcess('Code'), true);
  assert.equal(isWhitelistedProcess('notepad'), false);
  assert.equal(isWhitelistedProcess(''), false);
  // buildWindowMap 对不带 .exe 的进程名同样过滤/命中
  const map = buildWindowMap([{ hwnd: 9, pid: 9, title: CWD, processName: 'WindowsTerminal' }], [CWD]);
  assert.equal(map.get('9'), CWD);
});
