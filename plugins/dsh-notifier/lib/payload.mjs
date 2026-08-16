// 事件载荷映射:dsh 会话事件 → cc-notifier 事件载荷
// 与 scripts/lib/events.mjs 的 parseEvent 输出同构,daemon 侧零改动。
// 共享库经相对路径引用 cc-notifier 仓库(插件随仓库分发,保持单一事实源;
// 若日后独立发布,将 scripts/lib 的纯函数 vendored 进本包)。
import { projectName, summarize, truncate } from '../../../scripts/lib/events.mjs';

const cwdOf = (session) => (session && session.header && session.header.cwd) || '';

// dsh 的 ask_user_question 工具名(对应 cc-notifier 的 ask-user-question 通知)
export const QUESTION_TOOL = 'ask_user_question';

// session/created → session-start(daemon 绑定窗口 + 注册会话)
// surface ∈ 'web' | 'tui':daemon 按 surface 分派窗口绑定(web → 浏览器窗口;tui → 终端窗口)
// hostPid:会话宿主进程 pid(dsh host)。daemon 周期探测宿主存活,宿主退出即清理会话
// (dsh 宿主退出不发 session-end,靠这个实现智能关闭,否则会话滞留 12h)
export function toSessionStart(session, lang = 'zh', surface = 'tui', hostPid = 0) {
  const cwd = cwdOf(session);
  return {
    type: 'session-start', ts: Date.now(), sessionId: session.id, cwd,
    projectName: projectName(cwd), toolName: '', summary: '', lang,
    surface, hostPid,
  };
}

// session/disposed → session-end(daemon 注销会话;不弹 Toast)
export function toSessionEnd(session) {
  return {
    type: 'session-end', ts: Date.now(), sessionId: session.id,
    cwd: '', projectName: '', toolName: '', summary: '', lang: 'zh',
  };
}

// approval/asked → permission-request;摘要优先 reason 原文(dsh 比 Claude Code hook 多给的字段)
// surface 全程透传(daemon 重启后会话表清空,事件自身携带 surface 才能继续按 web 分派跳转)
// sessionTitle:会话标题(dsh LLM 生成,如「追加hosts映射记录」),Toast 个性化辨识用
export function toApprovalAsked(session, event, lang, surface = 'tui', sessionTitle = '') {
  const cwd = cwdOf(session);
  const data = (event && event.data) || {};
  const toolName = data.toolName || '';
  return {
    type: 'permission-request', ts: Date.now(), sessionId: session.id, cwd,
    projectName: projectName(cwd), toolName,
    summary: summarize(lang, 'approval-ask', { toolName, reason: data.reason }),
    lang, surface, sessionTitle,
  };
}

// tool/call(ask_user_question) → ask-user-question;
// 问题文本取 arguments.questions[0].question。
// 注意:实测(2026-08-16 tui)dsh 持久化事件的 arguments 是 **JSON 字符串** 而非对象
// (LLM 原始参数序列化),必须先解析;web 侧同一提取逻辑,同样受影响
export function toAskUserQuestion(session, event, lang, surface = 'tui', sessionTitle = '') {
  const cwd = cwdOf(session);
  let args = (event && event.data && event.data.arguments) || {};
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = {}; }
  }
  const qs = Array.isArray(args.questions) ? args.questions : [];
  const prompt = qs.length > 0 && qs[0] ? String(qs[0].question || qs[0].prompt || '') : '';
  return {
    type: 'ask-user-question', ts: Date.now(), sessionId: session.id, cwd,
    projectName: projectName(cwd), toolName: QUESTION_TOOL,
    summary: truncate(prompt), lang, surface, sessionTitle,
  };
}

// tool/result(isError)→ tool-result;错误文本取自 message.content / error.info。
// dsh 实测(2026-08-16 tui):命令失败时 message.isError 为 **false**(命令失败被当作
// 正常结果),错误信息在文本里,格式为 `[stderr]\n...\n[exit code: N]`(N≠0)。
// 因此错误识别 = isError 为真 **或** 文本含 `[stderr]` / `[exit code: 非零]`。
export function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(extractText).filter(Boolean).join(' ');
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (content.content !== undefined) return extractText(content.content);
  }
  return '';
}

export function isErrorResult(event) {
  const data = (event && event.data) || {};
  if (data.message && data.message.isError === true) return true;
  const text = extractText(data.message && data.message.content);
  return /\[exit code: [1-9]\d*\]/.test(text) || /\[stderr\]/.test(text);
}

export function toToolResult(session, event, lang, surface = 'tui', sessionTitle = '') {
  const cwd = cwdOf(session);
  const data = (event && event.data) || {};
  const message = data.message || {};
  const errText = (data.error && (data.error.message || (data.error.info && data.error.info.name)))
    || extractText(message.content);
  return {
    type: 'tool-result', ts: Date.now(), sessionId: session.id, cwd,
    projectName: projectName(cwd), toolName: data.name || '',
    summary: summarize(lang, 'tool-error', { errText: truncate(errText) }),
    lang, surface, sessionTitle,
  };
}

// agent/status running→idle 沿 → stop(等待输入);dsh 专用文案(区别于 Claude Code 的 stop 模板)
export function toStop(session, lang, surface = 'tui', sessionTitle = '') {
  const cwd = cwdOf(session);
  return {
    type: 'stop', ts: Date.now(), sessionId: session.id, cwd,
    projectName: projectName(cwd), toolName: '',
    summary: summarize(lang, 'stop-dsh'), lang, surface, sessionTitle,
  };
}

// session/event 中需要通知的事件类型。
// 性能红线:先纯内存过滤(Set.has)再解析语言/读配置——session/event 是高频流
// (assistant/chunk 每 token 一条),过滤前做任何 I/O(reg 子进程、readFileSync)
// 都会同步阻塞 host event loop 导致卡顿(2026-08-16 实测,已修复)。
// tool/call 与 tool/result 频率低(每次工具调用),入白名单后仍须在 mapSessionEvent
// 内做纯字段判断(name/isError),不得引入 I/O。
export const NOTIFY_SESSION_EVENT_TYPES = new Set(['approval/asked', 'tool/call', 'tool/result']);

// 过滤映射:非通知事件返回 null。
// 四类通知:approval/asked(权限)、tool/call+ask_user_question(提问)、
// tool/result+isError(报错);等待输入走 agent/status(非 session/event,见 index.js)。
export function mapSessionEvent(session, event, lang, surface = 'tui', sessionTitle = '') {
  const data = (event && event.data) || {};
  switch (event && event.type) {
    case 'approval/asked':
      return toApprovalAsked(session, event, lang, surface, sessionTitle);
    case 'tool/call':
      return data.name === QUESTION_TOOL ? toAskUserQuestion(session, event, lang, surface, sessionTitle) : null;
    case 'tool/result':
      return isErrorResult(event) ? toToolResult(session, event, lang, surface, sessionTitle) : null;
    default:
      return null;
  }
}
