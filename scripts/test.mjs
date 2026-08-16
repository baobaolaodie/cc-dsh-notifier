#!/usr/bin/env node
// 手动测试:经转发器触发四类事件(走真实管线,失焦时弹 Toast)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AGENT = fileURLToPath(new URL('./notify-agent.mjs', import.meta.url));
const CWD = process.cwd();

// fixtures 使用真实 Claude Code hook JSON 格式(扁平 tool_name/tool_input,2026-08-13 修复)
const FIXTURES = {
  'permission-request': {
    session_id: 'test-session', cwd: CWD, hook_event_name: 'PermissionRequest',
    tool_name: 'Bash', tool_input: { command: 'npm install' },
  },
  'ask-user-question': {
    session_id: 'test-session', cwd: CWD, hook_event_name: 'PreToolUse', matcher: 'AskUserQuestion',
    tool_name: 'AskUserQuestion', tool_input: { questions: [{ prompt: '请确认是否继续?(测试问题预览)' }] },
  },
  stop: { session_id: 'test-session', cwd: CWD, hook_event_name: 'Stop' },
  'session-start': { session_id: 'test-session', cwd: CWD, hook_event_name: 'SessionStart' },
};

const type = process.argv[2];
if (!type || !FIXTURES[type]) {
  console.error('用法: node scripts/test.mjs <permission-request|ask-user-question|stop|session-start> / Usage: node scripts/test.mjs <permission-request|ask-user-question|stop|session-start>');
  process.exit(1);
}
const child = spawn(process.execPath, [AGENT, type], { stdio: ['pipe', 'inherit', 'inherit'] });
child.stdin.end(JSON.stringify(FIXTURES[type]));
child.on('exit', (code) => process.exit(code ?? 0));
