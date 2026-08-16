// 事件模型:统一事件类型、cwd 归一化、项目名、toast 文案
// 通知类型(2026-08-16 用户决策移除 tool-result:工具出错不会让 agent 停下,
// 只会徒增通知噪音;保留 权限请求/提问/等待输入)
export const NOTIFY_TYPES = new Set([
  'permission-request',
  'ask-user-question',
  'stop',
]);

// 双语 Toast 标题(zh 与旧行为逐字一致;en 供英文系统);语言由 config.language 解析
export const TYPE_LABELS = {
  zh: {
    'permission-request': '权限请求',
    'ask-user-question': '提问',
    stop: '等待输入',
  },
  en: {
    'permission-request': 'Permission request',
    'ask-user-question': 'Question',
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
    // dsh 适配新增:approval/asked 事件自带 reason 文本(优于 Claude Code hook 的 tool_input)
    case 'approval-ask':
      if (payload.reason) {
        return zh
          ? `${payload.toolName} 请求权限:${truncate(payload.reason)}`
          : `${payload.toolName} requests permission: ${truncate(payload.reason)}`;
      }
      return zh ? `${payload.toolName} 请求执行权限` : `${payload.toolName} requests permission`;
    case 'stop':
      return zh ? 'Claude 等待输入' : 'Claude is waiting for input';
    // dsh 适配新增:agent 空闲(等待输入)文案,区别于 Claude Code 的 stop 模板;
    // 内容带产品名「DeepSeek Harness」(用户要求:Toast 身份不该是项目名 cc-dsh-notifier)
    case 'stop-dsh':
      return zh ? 'DeepSeek Harness 等待输入' : 'DeepSeek Harness is waiting for input';
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

// 返回规范化事件载荷;未知类型返回 null(含 tool-result——已移除通知)
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
    // 2026-08-16 用户决策:工具出错不再通知(工具出错不会让 agent 停下,徒增噪音),
    // tool-result 分支已移除;parseEvent 对未知类型返回 null → notify-agent 秒退
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
