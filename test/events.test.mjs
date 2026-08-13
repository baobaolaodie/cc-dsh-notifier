import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEvent, normalizeCwd, projectName, truncate, toastContent, NOTIFY_TYPES,
} from '../scripts/lib/events.mjs';

const CWD = 'D:\\LongYinHaHa\\VSCode\\cc-notifier';

test('事件类型映射与基础载荷', () => {
  const ev = parseEvent('permission-request', {
    session_id: 's1', cwd: CWD, hook_event_name: 'PermissionRequest',
  });
  assert.equal(ev.type, 'permission-request');
  assert.equal(ev.cwd, CWD);
  assert.equal(ev.projectName, 'cc-notifier');
  assert.equal(ev.sessionId, 's1');
  assert.equal(typeof ev.ts, 'number');
  assert.equal(ev.toolName, '');
  assert.equal(ev.summary, '');
});

test('session-start / session-end 载荷', () => {
  const s = parseEvent('session-start', { session_id: 's9', cwd: CWD });
  assert.equal(s.type, 'session-start');
  assert.equal(s.sessionId, 's9');
  const e = parseEvent('session-end', { session_id: 's9', cwd: CWD });
  assert.equal(e.type, 'session-end');
  assert.equal(e.summary, '');
});

test('缺字段用默认值填充,不抛异常', () => {
  const ev = parseEvent('permission-request', {});
  assert.equal(ev.cwd, '');
  assert.equal(ev.projectName, '');
  assert.equal(ev.sessionId, null);
});

test('未知事件类型返回 null', () => {
  assert.equal(parseEvent('bogus', {}), null);
  assert.equal(parseEvent('', {}), null);
});

test('normalizeCwd 去尾部分隔符并小写,projectName 取最后一段', () => {
  assert.equal(normalizeCwd('D:\\Foo\\Bar\\'), 'd:\\foo\\bar');
  assert.equal(projectName('D:\\Foo\\Bar'), 'Bar');
  assert.equal(projectName(''), '');
  assert.equal(truncate('abc', 5), 'abc');
  assert.equal(truncate('abcdef', 5), 'abcd…');
});

test('normalizeCwd 统一分隔符(反斜杠/正斜杠等价)', () => {
  assert.equal(normalizeCwd('D:\\Foo\\Bar'), normalizeCwd('D:/Foo/Bar'));
  assert.equal(normalizeCwd('D:/Foo/Bar/'), 'd:\\foo\\bar');
});

test('NOTIFY_TYPES 只含四类通知事件', () => {
  assert.deepEqual([...NOTIFY_TYPES].sort(), [
    'ask-user-question', 'permission-request', 'stop', 'tool-result',
  ]);
});

test('permission-request: 真实 hook JSON 扁平格式(仅命令本身)', () => {
  const ev = parseEvent('permission-request', {
    session_id: 's1', cwd: CWD, hook_event_name: 'PermissionRequest',
    tool_name: 'Bash', tool_input: { command: 'npm install' },
  });
  assert.equal(ev.toolName, 'Bash');
  assert.equal(ev.summary, 'Bash 请求执行:npm install');
});

test('permission-request: 嵌套 tool_use 回退兼容', () => {
  const ev = parseEvent('permission-request', {
    session_id: 's1', cwd: CWD,
    tool_use: { id: 't1', name: 'Bash', input: { command: 'npm install' } },
  });
  assert.equal(ev.toolName, 'Bash');
  assert.equal(ev.summary, 'Bash 请求执行:npm install');
});

test('permission-request: 非 Bash 工具取 file_path', () => {
  const ev = parseEvent('permission-request', {
    cwd: CWD,
    tool_use: { name: 'Write', input: { file_path: 'D:\\a\\b.txt' } },
  });
  assert.equal(ev.summary, 'Write 请求访问:D:\\a\\b.txt');
});

test('permission-request: Bash 无 command 时给默认文案', () => {
  const ev = parseEvent('permission-request', { cwd: CWD, tool_use: { name: 'Bash', input: {} } });
  assert.equal(ev.summary, 'Bash 请求执行权限');
});

test('ask-user-question: 真实 hook JSON 扁平格式取 questions[0].prompt 并截断', () => {
  const ev = parseEvent('ask-user-question', {
    cwd: CWD, hook_event_name: 'PreToolUse',
    tool_name: 'AskUserQuestion', tool_input: { questions: [{ prompt: 'x'.repeat(200) }] },
  });
  assert.equal(ev.toolName, 'AskUserQuestion');
  assert.equal(ev.summary.length, 80);
  assert.ok(ev.summary.endsWith('…'));
});

test('ask-user-question: 嵌套 tool_use 回退兼容', () => {
  const ev = parseEvent('ask-user-question', {
    cwd: CWD,
    tool_use: { name: 'AskUserQuestion', input: { questions: [{ prompt: 'x'.repeat(200) }] } },
  });
  assert.equal(ev.toolName, 'AskUserQuestion');
  assert.equal(ev.summary.length, 80);
  assert.ok(ev.summary.endsWith('…'));
});

test('tool-result: 真实 hook JSON 扁平格式错误时通知并提取错误摘要', () => {
  const ev = parseEvent('tool-result', {
    cwd: CWD, hook_event_name: 'PostToolUse',
    tool_name: 'Bash', tool_input: { command: 'npm test' },
    tool_response: { type: 'tool_result', is_error: true, content: [{ type: 'text', text: 'Command failed' }] },
  });
  assert.equal(ev.type, 'tool-result');
  assert.equal(ev.toolName, 'Bash');
  assert.equal(ev.summary, 'Command failed');
});

test('tool-result: 嵌套 tool_use 回退兼容', () => {
  const ev = parseEvent('tool-result', {
    cwd: CWD,
    tool_use: { name: 'Bash', input: { command: 'npm test' } },
    tool_response: { is_error: true, content: [{ type: 'text', text: 'Command failed' }] },
  });
  assert.equal(ev.type, 'tool-result');
  assert.equal(ev.toolName, 'Bash');
  assert.equal(ev.summary, 'Command failed');
});

test('tool-result: error 字段兜底', () => {
  const ev = parseEvent('tool-result', {
    cwd: CWD, tool_use: { name: 'Bash' },
    tool_response: { error: 'Command failed: npm test' },
  });
  assert.equal(ev.summary, 'Command failed: npm test');
});

test('tool-result: 非错误返回 null(不通知)', () => {
  const ev = parseEvent('tool-result', {
    cwd: CWD, tool_use: { name: 'Bash' }, tool_response: { is_error: false, content: 'ok' },
  });
  assert.equal(ev, null);
});

test('stop: 等待输入文案', () => {
  const ev = parseEvent('stop', { cwd: CWD });
  assert.equal(ev.summary, 'Claude 等待输入');
});

test('toastContent: 标题=事件类型标签,正文=摘要', () => {
  const ev = parseEvent('permission-request', {
    cwd: CWD, tool_use: { name: 'Bash', input: { command: 'npm install' } },
  });
  const c = toastContent(ev);
  assert.equal(c.title, '权限请求');
  assert.equal(c.body, 'Bash 请求执行:npm install');
});
