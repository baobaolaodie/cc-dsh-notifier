#!/usr/bin/env node
// 手动测试:经转发器触发四类事件(走真实管线,失焦时弹 Toast)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AGENT = fileURLToPath(new URL('./notify-agent.mjs', import.meta.url));
const CWD = process.cwd();

const FIXTURES = {
  'permission-request': {
    session_id: 'test-session', cwd: CWD, hook_event_name: 'PermissionRequest',
    tool_use: { id: 't1', name: 'Bash', input: { command: 'npm install' } },
  },
  'ask-user-question': {
    session_id: 'test-session', cwd: CWD, hook_event_name: 'PreToolUse', matcher: 'AskUserQuestion',
    tool_use: { id: 't2', name: 'AskUserQuestion', input: { questions: [{ prompt: '请确认是否继续?(测试问题预览)' }] } },
  },
  'tool-result': {
    session_id: 'test-session', cwd: CWD, hook_event_name: 'PostToolUse',
    tool_use: { id: 't3', name: 'Bash', input: { command: 'npm test' } },
    tool_response: { is_error: true, error: 'Command failed: npm test', content: [{ type: 'text', text: 'test failed' }] },
  },
  stop: { session_id: 'test-session', cwd: CWD, hook_event_name: 'Stop' },
  'session-start': { session_id: 'test-session', cwd: CWD, hook_event_name: 'SessionStart' },
};

const type = process.argv[2];
if (!type || !FIXTURES[type]) {
  console.error('用法: node scripts/test.mjs <permission-request|ask-user-question|tool-result|stop|session-start>');
  process.exit(1);
}
const child = spawn(process.execPath, [AGENT, type], { stdio: ['pipe', 'inherit', 'inherit'] });
child.stdin.end(JSON.stringify(FIXTURES[type]));
child.on('exit', (code) => process.exit(code ?? 0));
