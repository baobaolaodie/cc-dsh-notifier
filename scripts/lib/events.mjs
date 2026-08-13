// 事件模型:统一事件类型、cwd 归一化、项目名、toast 文案
export const NOTIFY_TYPES = new Set([
  'permission-request',
  'ask-user-question',
  'tool-result',
  'stop',
]);

export const TYPE_LABELS = {
  'permission-request': '权限请求',
  'ask-user-question': '提问',
  'tool-result': '工具出错',
  stop: '等待输入',
};

export function normalizeCwd(cwd) {
  if (!cwd) return '';
  // 分隔符统一为 \ (反斜杠),否则 D:\foo 与 D:/foo 比较不相等
  // (2026-08-14 修复:目录匹配绑定发现 hook JSON cwd 为正斜杠、进程命令行路径为反斜杠)
  const c = String(cwd).replace(/[\\/]+$/, '').replace(/\//g, '\\');
  return process.platform === 'win32' ? c.toLowerCase() : c;
}

export function projectName(cwd) {
  if (!cwd) return '';
  const parts = String(cwd).split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(cwd);
}

export function truncate(s, max = 80) {
  if (!s) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// 返回规范化事件载荷;tool-result 非错误或未知类型返回 null
export function parseEvent(eventType, hookJson = {}) {
  const base = {
    ts: Date.now(),
    sessionId: hookJson.session_id || null,
    cwd: hookJson.cwd || '',
    projectName: projectName(hookJson.cwd || ''),
    toolName: '',
    summary: '',
  };
  switch (eventType) {
    case 'session-start':
      return { ...base, type: 'session-start' };
    case 'session-end':
      return { ...base, type: 'session-end' };
    case 'permission-request': {
      // 真实 Claude Code hook JSON 是扁平格式(tool_name/tool_input);
      // 嵌套 tool_use 仅为兼容旧测试/调用方(2026-08-13 修复 hook 格式不匹配)
      const toolName = hookJson.tool_name || (hookJson.tool_use || {}).name || '';
      const input = hookJson.tool_input || (hookJson.tool_use || {}).input || {};
      let summary = '';
      if (toolName === 'Bash') {
        summary = input.command ? `Bash 请求执行:${input.command}` : 'Bash 请求执行权限';
      } else if (typeof input.file_path === 'string') {
        summary = `${toolName} 请求访问:${input.file_path}`;
      } else if (toolName) {
        summary = `${toolName} 请求执行`;
      }
      return { ...base, type: 'permission-request', toolName, summary };
    }
    case 'ask-user-question': {
      const input = hookJson.tool_input || (hookJson.tool_use || {}).input || {};
      const qs = Array.isArray(input.questions) ? input.questions : [];
      const prompt = qs.length > 0 && qs[0] ? String(qs[0].prompt || '') : '';
      return { ...base, type: 'ask-user-question', toolName: 'AskUserQuestion', summary: truncate(prompt) };
    }
    case 'tool-result': {
      const toolName = hookJson.tool_name || (hookJson.tool_use || {}).name || '';
      const resp = hookJson.tool_response || {};
      const isError = resp.is_error === true || Boolean(resp.error);
      if (!isError) return null; // 非错误不通知
      const errText = resp.error
        || (Array.isArray(resp.content) ? resp.content.map((c) => (c && c.text) || '').join(' ').trim() : String(resp.content || ''));
      return { ...base, type: 'tool-result', toolName, summary: truncate(errText) || '工具执行出错' };
    }
    case 'stop':
      return { ...base, type: 'stop', summary: 'Claude 等待输入' };
    default:
      return null;
  }
}

// 返回 { title: 事件类型标签, body: 摘要 };项目名前缀由 toast-agent.py 拼接
export function toastContent(event) {
  return { title: TYPE_LABELS[event.type] || event.type, body: event.summary || '' };
}
