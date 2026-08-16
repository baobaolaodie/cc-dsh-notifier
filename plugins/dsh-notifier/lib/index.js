// dsh-notifier:DeepSeek Harness → cc-notifier 适配插件
// 订阅 dsh 会话事件,转发给 cc-notifier daemon(Windows Toast 通知)。
// web 与 tui profile 共用同一 host 核心,本插件装进任一 profile 即覆盖该 surface。
// 失败隔离:所有处理 try/catch + logger,绝不抛出到 dsh host。
import { loadConfig, resolveLanguage } from '../../../scripts/lib/config.mjs';
import { mapSessionEvent, toSessionStart, toSessionEnd, toStop, NOTIFY_SESSION_EVENT_TYPES } from './payload.mjs';
import { forward, readState, isPidAlive } from './forwarder.mjs';
import { createDaemonResync } from './resync.mjs';

export const name = 'dsh-notifier';

// 运行时检测 surface:web profile 由 dsh CLI 以 "--profile web"(或 web 别名)启动,
// profile 名必然出现在进程 argv(launcher 强制要求,实测 argv 含 "--profile","web");
// tui/其他 profile → 'tui'。CCN_SURFACE 环境变量可强制覆盖(自定义 profile 场景)。
function detectSurface() {
  if (process.env.CCN_SURFACE === 'web' || process.env.CCN_SURFACE === 'tui') return process.env.CCN_SURFACE;
  const argv = process.argv.slice(1);
  if (argv[1] === 'web') return 'web'; // dsh web 别名(argv[1] 为 launcher 后首个 token)
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--profile' && argv[i + 1] === 'web') return 'web';
  }
  return 'tui';
}

export function apply(ctx) {
  const surface = detectSurface();
  const logger = (() => {
    try { return ctx.logger('dsh-notifier'); } catch { return console; }
  })();

  // 语言与全局开关:与 notify-agent 一致——仅通知事件解析语言(省 reg 开销);
  // enabled 来自 ~/.cc-notifier/config.json(loadConfig 含项目级覆盖)。
  // gateCache:按 cwd 缓存解析结果——resolveLanguage 会同步 spawn reg 子进程
  // (30-80ms),任何高频路径都不允许反复触发;配置变更需重启 profile 生效,缓存不过期
  const gateCache = new Map();
  const gate = (cwd) => {
    const key = cwd || '';
    const cached = gateCache.get(key);
    if (cached) return cached;
    const cfg = loadConfig(key);
    const resolved = { cfg, lang: resolveLanguage(cfg) };
    if (gateCache.size >= 64) gateCache.clear(); // 有界:防项目切换积累
    gateCache.set(key, resolved);
    return resolved;
  };

  // daemon 重启检测与会话重注册:daemon 是单实例,只有它死了才会被新事件拉起;
  // 重启后其会话表清空,宿主不会重发 session-start → 绑定/聚焦退化。
  // 检测到 daemon pid 变化 → 重发全部已注册会话的 session-start(2026-08-16 用户反馈)
  const registeredSessions = new Map(); // sessionId → session
  const resync = createDaemonResync({
    readState,
    isPidAlive,
    onNewDaemon: (pid) => {
      logger.info('daemon 重启检测,重注册 ' + registeredSessions.size + ' 个会话', 'pid=' + pid);
      for (const session of registeredSessions.values()) {
        try { void forward(toSessionStart(session, 'zh', surface, process.pid)); } catch { /* 单会话失败不影响其他 */ }
      }
    },
  });

  // 会话标题种子:已有会话的历史 session/title 事件不会重放,插件加载时从会话日志
  // 尾部回扫最新标题(单次线性扫描,无拷贝;长会话也仅毫秒级),让旧会话的 Toast 同样个性化
  const seedSessionTitle = (session) => {
    try {
      if (!session || !Array.isArray(session.events)) return;
      for (let i = session.events.length - 1; i >= 0; i -= 1) {
        const e = session.events[i];
        if (e && e.type === 'session/title' && e.data
          && typeof e.data.title === 'string' && e.data.title) {
          sessionTitles.set(session.id, e.data.title);
          return;
        }
      }
    } catch { /* 日志不可读则跳过种子 */ }
  };

  // session-start:注册会话 + 唤醒 daemon(若不在);surface 决定 daemon 的窗口绑定方向
  ctx.on('session/created', (session) => {
    try {
      seedSessionTitle(session);
      const cwd = (session && session.header && session.header.cwd) || '';
      const { cfg } = gate(cwd);
      if (cfg.enabled === false) return;
      registeredSessions.set(session.id, session);
      resync(); // daemon 重启检测:首次也会同步现有 daemon
      logger.info('session-start', session.id, cwd || '(no cwd)', 'surface=' + surface);
      void forward(toSessionStart(session, 'zh', surface, process.pid));
    } catch (err) {
      logger.warn('session/created 处理失败', err && err.message);
    }
  });

  // session-end:注销会话(不弹 Toast)
  ctx.on('session/disposed', (session) => {
    try {
      logger.info('session-end', session.id);
      if (session) {
        sessionTitles.delete(session.id);
        registeredSessions.delete(session.id);
      }
      void forward(toSessionEnd(session));
    } catch (err) {
      logger.warn('session/disposed 处理失败', err && err.message);
    }
  });

  // 持久事件流:仅过滤通知类型(approval/asked → permission-request)。
  // 性能红线:先做纯内存过滤(Set.has),命中后才解析语言/读配置——
  // session/event 是高频流(assistant/chunk 每 token 一条),gate() 含 reg 子进程,
  // 若对每条事件执行会阻塞 host event loop(2026-08-16 实测卡顿,已修复)
  ctx.on('session/event', (session, event) => {
    try {
      if (!event) return;
      observeSessionTitle(session, event);
      if (!NOTIFY_SESSION_EVENT_TYPES.has(event.type)) return;
      resync(); // daemon 重启检测:仅通知事件执行(低频;读状态文件是同步 I/O,不进热路径)
      const cwd = (session && session.header && session.header.cwd) || '';
      const { cfg, lang } = gate(cwd);
      if (cfg.enabled === false) return;
      const payload = mapSessionEvent(session, event, lang, surface, sessionTitles.get(session.id) || '');
      if (!payload) return;
      logger.info('session/event', event.type, payload.summary || '');
      void forward(payload);
    } catch (err) {
      logger.warn('session/event 处理失败', err && err.message);
    }
  });

  // 会话标题观察:session/title 事件(dsh LLM 生成标题,如「追加hosts映射记录」)——
  // 供 Toast 个性化显示(sessionTitle 字段);低频纯内存,随会话销毁清理
  const sessionTitles = new Map(); // sessionId → 最新标题
  const observeSessionTitle = (session, event) => {
    if (event.type === 'session/title' && event.data
      && typeof event.data.title === 'string' && event.data.title) {
      sessionTitles.set(session.id, event.data.title);
    }
  };

  // 等待输入:agent/status running→idle 沿(权威信号,turn/end 后仍可能续跑)。
  // 每 agent 一个订阅(dsh-schedule 同款模式);状态为纯内存记录,频率极低(phase 切换)。
  // 注意:不再有「交互后抑制」——2026-08-16 用户决策去掉(发消息/审批后 15s 内不弹的
  // 规则会在用户切走时吞掉想收的通知;聚焦静默由 daemon 判定负责,插件只负责转发)
  const agentStatus = new Map(); // agentId → 'running' | 'idle'
  ctx.on('agent/created', ({ agent }) => {
    try {
      if (!agent) return;
      agent.ctx.on('agent/status', ({ status }) => {
        try {
          if (!status) return;
          const prev = agentStatus.get(agent.id);
          agentStatus.set(agent.id, status);
          if (prev !== 'running' || status !== 'idle') return; // 仅 running→idle 沿
          const session = agent.session;
          if (!session) return;
          const cwd = (session.header && session.header.cwd) || '';
          const { cfg, lang } = gate(cwd);
          if (cfg.enabled === false) return;
          // 无交互抑制:聚焦静默由 daemon 判定(在看→静默,切走→弹),插件只转发
          logger.info('stop(等待输入)', agent.id);
          void forward(toStop(session, lang, surface, sessionTitles.get(session.id) || ''));
        } catch (err) {
          logger.warn('agent/status 处理失败', err && err.message);
        }
      });
    } catch (err) {
      logger.warn('agent/created 处理失败', err && err.message);
    }
  });
  ctx.on('agent/disposed', ({ agent }) => {
    if (agent) agentStatus.delete(agent.id);
  });

  logger.info('dsh-notifier 已启用(事件 → cc-notifier daemon)');
}
