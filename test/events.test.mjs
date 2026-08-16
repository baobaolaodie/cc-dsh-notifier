import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEvent, normalizeCwd, projectName, truncate, toastContent, NOTIFY_TYPES,
} from '../scripts/lib/events.mjs';

const CWD = 'D:\\dev\\cc-notifier';

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
  // 平台无关断言:win32 小写化,其他平台保持原样(硬编码 win32 输出会使 CI(Linux)失败)
  const expected = process.platform === 'win32' ? 'd:\\foo\\bar' : 'D:\\Foo\\Bar';
  assert.equal(normalizeCwd('D:\\Foo\\Bar\\'), expected);
  assert.equal(projectName('D:\\Foo\\Bar'), 'Bar');
  assert.equal(projectName(''), '');
  assert.equal(truncate('abc', 5), 'abc');
  assert.equal(truncate('abcdef', 5), 'abcd…');
});

test('normalizeCwd 统一分隔符(反斜杠/正斜杠等价)', () => {
  // 输入用纯正斜杠避免非 win32 平台把反斜杠当普通字符
  const a = normalizeCwd('D:/Foo/Bar');
  const b = normalizeCwd('D:/Foo/Bar/');
  assert.equal(a, b);
  assert.ok(a.includes('\\'), '分隔符应统一为反斜杠');
});

test('NOTIFY_TYPES 只含三类通知事件(tool-result 已移除)', () => {
  assert.deepEqual([...NOTIFY_TYPES].sort(), [
    'ask-user-question', 'permission-request', 'stop',
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

test('permission-request: AskUserQuestion 跳过(与 PreToolUse 提问去重)', () => {
  const ev = parseEvent('permission-request', {
    cwd: CWD, hook_event_name: 'PermissionRequest',
    tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'x' }] },
  });
  assert.equal(ev, null);
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

test('ask-user-question: 真实 hook JSON 扁平格式取 questions[0].question 并截断', () => {
  const ev = parseEvent('ask-user-question', {
    cwd: CWD, hook_event_name: 'PreToolUse',
    tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'x'.repeat(200) }] },
  });
  assert.equal(ev.toolName, 'AskUserQuestion');
  assert.equal(ev.summary.length, 80);
  assert.ok(ev.summary.endsWith('…'));
});

test('ask-user-question: question 字段缺失时回退 prompt(兼容旧调用方)', () => {
  const ev = parseEvent('ask-user-question', {
    cwd: CWD, hook_event_name: 'PreToolUse',
    tool_name: 'AskUserQuestion', tool_input: { questions: [{ prompt: '旧格式' }] },
  });
  assert.equal(ev.summary, '旧格式');
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

test('tool-result 已移除通知(2026-08-16 用户决策):parseEvent 返回 null', () => {
  // 工具出错不会让 agent 停下,只徒增通知噪音 → 不再触发 Toast
  const err = parseEvent('tool-result', {
    cwd: CWD, hook_event_name: 'PostToolUse',
    tool_name: 'Bash', tool_input: { command: 'npm test' },
    tool_response: { type: 'tool_result', is_error: true, content: [{ type: 'text', text: 'Command failed' }] },
  });
  assert.equal(err, null);
  const ok = parseEvent('tool-result', {
    cwd: CWD, tool_use: { name: 'Bash' }, tool_response: { is_error: false, content: 'ok' },
  });
  assert.equal(ok, null);
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

test('i18n: lang=en 时标题与摘要为英文', () => {
  const ev = parseEvent('permission-request', {
    cwd: CWD, tool_use: { name: 'Bash', input: { command: 'npm install' } },
  }, 'en');
  assert.equal(ev.lang, 'en');
  const c = toastContent(ev);
  assert.equal(c.title, 'Permission request');
  assert.equal(c.body, 'Bash requested to run: npm install');
});

test('i18n: lang=en 覆盖三类事件标题(tool-result 已移除)', () => {
  const cases = [
    ['permission-request', {}, 'Permission request'],
    ['ask-user-question', { tool_use: { name: 'AskUserQuestion', input: { questions: [{ question: 'q' }] } } }, 'Question'],
    ['stop', {}, 'Waiting for input'],
  ];
  for (const [type, hook, title] of cases) {
    const c = toastContent(parseEvent(type, { cwd: CWD, ...hook }, 'en'));
    assert.equal(c.title, title, type);
  }
});

test('i18n: lang 缺省回退 zh(旧行为不变)', () => {
  const ev = parseEvent('stop', { cwd: CWD }); // 不传 lang
  assert.equal(ev.lang, 'zh');
  const c = toastContent(ev);
  assert.equal(c.title, '等待输入');
  assert.equal(c.body, 'Claude 等待输入');
});

test('i18n: 未知 lang 的 toastContent 回退 zh 标签', () => {
  const c = toastContent({ type: 'stop', summary: 'x', lang: 'fr' });
  assert.equal(c.title, '等待输入');
});

test('i18n: Bash 无 command 时默认文案按语言', () => {
  const zh = parseEvent('permission-request', { cwd: CWD, tool_use: { name: 'Bash' } });
  assert.equal(zh.summary, 'Bash 请求执行权限');
  const en = parseEvent('permission-request', { cwd: CWD, tool_use: { name: 'Bash' } }, 'en');
  assert.equal(en.summary, 'Bash requests permission to run');
});

test('i18n: 非 Bash 工具 file_path 文案按语言', () => {
  const zh = parseEvent('permission-request', { cwd: CWD, tool_use: { name: 'Read', input: { file_path: 'a.txt' } } });
  assert.equal(zh.summary, 'Read 请求访问:a.txt');
  const en = parseEvent('permission-request', { cwd: CWD, tool_use: { name: 'Read', input: { file_path: 'a.txt' } } }, 'en');
  assert.equal(en.summary, 'Read requests access to: a.txt');
});

test('i18n: 非 Bash 无 file_path 工具(tool-run)文案按语言', () => {
  const zh = parseEvent('permission-request', { cwd: CWD, tool_use: { name: 'Grep' } });
  assert.equal(zh.summary, 'Grep 请求执行');
  const en = parseEvent('permission-request', { cwd: CWD, tool_use: { name: 'Grep' } }, 'en');
  assert.equal(en.summary, 'Grep requested to run');
});
