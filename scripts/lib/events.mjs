// 事件模型:统一事件类型、cwd 归一化、项目名、toast 文案
export const NOTIFY_TYPES = new Set([
  'permission-request',
  'ask-user-question',
  'tool-result',
  'stop',
]);

// 双语 Toast 标题(zh 与旧行为逐字一致;en 供英文系统);语言由 config.language 解析
export const TYPE_LABELS = {
  zh: {
    'permission-request': '权限请求',
    'ask-user-question': '提问',
    'tool-result': '工具出错',
    stop: '等待输入',
  },
  en: {
    'permission-request': 'Permission request',
    'ask-user-question': 'Question',
    'tool-result': 'Tool error',
    stop: 'Waiting for input',
  },
};

// summary 模板(按语言);zh 文案与旧行为逐字一致
export function summarize(lang, kind, payload = {}) {
  const zh = lang === 'zh';
  switch (kind) {
    case 'bash-request':
      if (!payload.command) return zh ? 'Bash 请求执行权限' : 'Bash requests permission to run';
      return zh ? `Bash 请求执行:${payload.command}` : `Bash requested to run: ${payload.command}`;
    case 'tool-file':
      return zh ? `${payload.toolName} 请求访问:${payload.filePath}` : `${payload.toolName} requests access to: ${payload.filePath}`;
    case 'tool-run':
      return zh ? `${payload.toolName} 请求执行` : `${payload.toolName} requested to run`;
    case 'tool-error':
      return payload.errText || (zh ? '工具执行出错' : 'Tool execution failed');
    case 'stop':
      return zh ? 'Claude 等待输入' : 'Claude is waiting for input';
    default:
      return '';
  }
}

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
// lang ∈ 'zh' | 'en',决定 summary 文案语言(缺省 zh 保持旧行为)
export function parseEvent(eventType, hookJson = {}, lang = 'zh') {
  const base = {
    ts: Date.now(),
    sessionId: hookJson.session_id || null,
    cwd: hookJson.cwd || '',
    projectName: projectName(hookJson.cwd || ''),
    toolName: '',
    summary: '',
    lang,
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
      // AskUserQuestion 权限请求与 PreToolUse 提问同时触发(同一工具调用),
      // 跳过避免双通知(2026-08-14 实测双弹「提问」+「权限请求」)
      if (toolName === 'AskUserQuestion') return null;
      const input = hookJson.tool_input || (hookJson.tool_use || {}).input || {};
      let summary = '';
      if (toolName === 'Bash') {
        summary = summarize(lang, 'bash-request', { command: input.command });
      } else if (typeof input.file_path === 'string') {
        summary = summarize(lang, 'tool-file', { toolName, filePath: input.file_path });
      } else if (toolName) {
        summary = summarize(lang, 'tool-run', { toolName });
      }
      return { ...base, type: 'permission-request', toolName, summary };
    }
    case 'ask-user-question': {
      const input = hookJson.tool_input || (hookJson.tool_use || {}).input || {};
      const qs = Array.isArray(input.questions) ? input.questions : [];
      // 真实 PreToolUse 载荷字段是 question(单数),兼容 prompt(旧测试/调用方)
      // (2026-08-14 实测 hook-dump:questions[0].question,代码原用 .prompt 提取为空)
      const prompt = qs.length > 0 && qs[0] ? String(qs[0].question || qs[0].prompt || '') : '';
      return { ...base, type: 'ask-user-question', toolName: 'AskUserQuestion', summary: truncate(prompt) };
    }
    case 'tool-result': {
      const toolName = hookJson.tool_name || (hookJson.tool_use || {}).name || '';
      const resp = hookJson.tool_response || {};
      const isError = resp.is_error === true || Boolean(resp.error);
      if (!isError) return null; // 非错误不通知
      const errText = resp.error
        || (Array.isArray(resp.content) ? resp.content.map((c) => (c && c.text) || '').join(' ').trim() : String(resp.content || ''));
      // 错误文本透传(原文),仅缺省时用语言化默认文案
      return { ...base, type: 'tool-result', toolName, summary: truncate(errText) || summarize(lang, 'tool-error', {}) };
    }
    case 'stop':
      return { ...base, type: 'stop', summary: summarize(lang, 'stop') };
    default:
      return null;
  }
}

// 返回 { title: 事件类型标签, body: 摘要 };项目名前缀由 toast-agent.py 拼接
export function toastContent(event) {
  const labels = TYPE_LABELS[event.lang] || TYPE_LABELS.zh;
  return { title: labels[event.type] || event.type, body: event.summary || '' };
}
