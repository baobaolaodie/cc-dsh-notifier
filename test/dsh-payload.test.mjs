// dsh-notifier 载荷映射单元测试:纯函数,无 cordis 依赖
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toSessionStart,
  toSessionEnd,
  toApprovalAsked,
  toAskUserQuestion,
  toStop,
  mapSessionEvent,
} from '../plugins/dsh-notifier/lib/payload.mjs';

const session = { id: 's-1', header: { cwd: 'D:\\Work\\Foo' } };

test('toSessionStart 输出与 parseEvent 同构(sessionId/cwd/projectName)', () => {
  const e = toSessionStart(session);
  assert.equal(e.type, 'session-start');
  assert.equal(e.sessionId, 's-1');
  assert.equal(e.cwd, 'D:\\Work\\Foo');
  assert.equal(e.projectName, 'Foo');
  assert.equal(e.summary, '');
  assert.equal(e.surface, 'tui'); // 缺省 tui
});

test('toSessionStart 支持 surface 分派(web → daemon 绑浏览器窗口)', () => {
  const e = toSessionStart(session, 'zh', 'web');
  assert.equal(e.surface, 'web');
});

test('toSessionStart 无 cwd 时不抛错', () => {
  const e = toSessionStart({ id: 's-2' });
  assert.equal(e.cwd, '');
  assert.equal(e.projectName, '');
});

test('toSessionEnd 注销会话', () => {
  const e = toSessionEnd(session);
  assert.equal(e.type, 'session-end');
  assert.equal(e.sessionId, 's-1');
});

test('toApprovalAsked 带 reason:摘要含 reason 原文(zh)', () => {
  const e = toApprovalAsked(
    session,
    { type: 'approval/asked', data: { id: 'a-1', toolName: 'pwsh', reason: '写入工作区外文件' } },
    'zh',
  );
  assert.equal(e.type, 'permission-request');
  assert.equal(e.toolName, 'pwsh');
  assert.match(e.summary, /写入工作区外文件/);
  assert.match(e.summary, /^pwsh 请求权限:/);
});

test('toApprovalAsked 带 reason:英文模板', () => {
  const e = toApprovalAsked(
    session,
    { type: 'approval/asked', data: { id: 'a-2', toolName: 'pwsh', reason: 'write outside workspace' } },
    'en',
  );
  assert.equal(e.summary, 'pwsh requests permission: write outside workspace');
});

test('toApprovalAsked 无 reason:回退 toolName 模板', () => {
  const zh = toApprovalAsked(session, { type: 'approval/asked', data: { id: 'a-3', toolName: 'Bash' } }, 'zh');
  assert.equal(zh.summary, 'Bash 请求执行权限');
  const en = toApprovalAsked(session, { type: 'approval/asked', data: { id: 'a-4', toolName: 'Bash' } }, 'en');
  assert.equal(en.summary, 'Bash requests permission');
});

test('mapSessionEvent 过滤:只接通知类型,其余返回 null', () => {
  assert.equal(mapSessionEvent(session, { type: 'approval/asked', data: { id: 'a-5', toolName: 'fs' } }, 'zh').type, 'permission-request');
  assert.equal(mapSessionEvent(session, { type: 'approval/decided', data: {} }, 'zh'), null);
  assert.equal(mapSessionEvent(session, { type: 'user/message', data: {} }, 'zh'), null);
  assert.equal(mapSessionEvent(session, { type: 'tool/call', data: { name: 'Think' } }, 'zh'), null); // 非提问工具
  assert.equal(mapSessionEvent(session, { type: 'tool/result', data: { message: { isError: false } } }, 'zh'), null); // 非错误
  assert.equal(mapSessionEvent(session, null, 'zh'), null);
});

test('toAskUserQuestion:tool/call ask_user_question → 提问,摘要取问题文本', () => {
  const e = toAskUserQuestion(
    session,
    { type: 'tool/call', data: { name: 'ask_user_question', arguments: { questions: [{ question: '继续执行还是放弃?' }] } } },
    'zh',
  );
  assert.equal(e.type, 'ask-user-question');
  assert.equal(e.toolName, 'ask_user_question');
  assert.equal(e.summary, '继续执行还是放弃?');
});

test('toAskUserQuestion:arguments 为 JSON 字符串(实测 dsh 持久化形态)→ 解析后提取问题文本', () => {
  // 2026-08-16 tui 实测:tool/call 事件的 arguments 是 JSON 字符串而非对象,
  // 未解析时 questions 为 undefined → 正文空;此测试为回归防护
  const raw = JSON.stringify({ questions: [{ id: 'q1', question: '接下来想让我做什么?', header: '下一步' }] });
  const e = toAskUserQuestion(
    session,
    { type: 'tool/call', data: { name: 'ask_user_question', arguments: raw } },
    'zh',
  );
  assert.equal(e.summary, '接下来想让我做什么?');
});

test('toAskUserQuestion:arguments 为损坏 JSON 字符串 → 摘要为空不抛错', () => {
  const e = toAskUserQuestion(
    session,
    { type: 'tool/call', data: { name: 'ask_user_question', arguments: '{oops' } },
    'zh',
  );
  assert.equal(e.summary, '');
});

test('toAskUserQuestion:无 questions 时摘要为空不抛错', () => {
  const e = toAskUserQuestion(session, { type: 'tool/call', data: { name: 'ask_user_question', arguments: {} } }, 'zh');
  assert.equal(e.summary, '');
});

test('tool/result 已移除通知(2026-08-16 用户决策):mapSessionEvent 返回 null', () => {
  // 工具出错不会让 agent 停下,只徒增通知噪音 → 不再触发 Toast
  const err = { type: 'tool/result', data: { name: 'Pwsh', message: { isError: true, content: 'Access denied' } } };
  assert.equal(mapSessionEvent(session, err, 'zh'), null);
  const cmdFail = {
    type: 'tool/result',
    data: { name: 'Pwsh', message: { isError: false, content: '[stderr]\nfailed\n[exit code: 1]' } },
  };
  assert.equal(mapSessionEvent(session, cmdFail, 'zh'), null);
  assert.equal(mapSessionEvent(session, { type: 'tool/result', data: {} }, 'zh'), null);
});

test('toStop:dsh 等待输入文案(区别于 Claude Code 的 stop,带产品名)', () => {
  assert.equal(toStop(session, 'zh').summary, 'DeepSeek Harness 等待输入');
  assert.equal(toStop(session, 'en').summary, 'DeepSeek Harness is waiting for input');
  assert.equal(toStop(session, 'zh').type, 'stop');
});

test('sessionTitle 透传:通知载荷携带会话标题(Toast 个性化显示)', () => {
  const stop = toStop(session, 'zh', 'web', '追加hosts映射记录');
  assert.equal(stop.sessionTitle, '追加hosts映射记录');
  const approval = toApprovalAsked(
    session,
    { type: 'approval/asked', data: { id: 'a-6', toolName: 'pwsh', reason: 'x' } },
    'zh', 'web', '追加hosts映射记录',
  );
  assert.equal(approval.sessionTitle, '追加hosts映射记录');
  assert.equal(approval.surface, 'web');
  // 缺省为空字符串,不影响旧调用
  assert.equal(toStop(session, 'zh').sessionTitle, '');
});

test('hostPid 透传:session-start 携带宿主进程(智能关闭用)', () => {
  const e = toSessionStart(session, 'zh', 'web', 12345);
  assert.equal(e.hostPid, 12345);
  assert.equal(toSessionStart(session).hostPid, 0);
});
