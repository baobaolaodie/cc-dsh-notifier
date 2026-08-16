// daemon 核心状态机(纯逻辑,依赖全部注入,便于单元测试):
// 会话表、聚焦判定、去重、空闲退出、宿主存活清理、TTL 清理。
// daemon.mjs 只负责组装真实依赖(win32 桥、HTTP、spawn)并调用本核心。
// 历史教训(2026-08-16):聚焦判定/生命周期曾多次出回归(假静默、去重吞通知、
// 会话滞留),原因就是这些决策逻辑没有自动化测试——本模块即为此而生。
import { NOTIFY_TYPES } from './events.mjs';
import { decideFocus } from './focus.mjs';

export function createDaemonCore(deps) {
  const {
    config = {},                    // { dedupWindowMs }
    isPidAlive = () => true,
    log = () => {},
    now = Date.now,
    idleMs = 60 * 1000,             // 会话空后空闲超时
    sessionTtlMs = 12 * 60 * 60 * 1000,
    onIdle = () => {},              // 空闲退出回调(entry 负责清状态+退出)
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    browserWhitelist = [],          // 浏览器进程白名单(web surface 聚焦兜底判定用)
    createDeduperImpl = (w) => {    // 默认实现(测试可注入)
      const last = new Map();
      return {
        shouldNotify(key) {
          const t = Date.now();
          const prev = last.get(key);
          last.set(key, t);
          if (prev === undefined) return true;
          return t - prev >= w;
        },
      };
    },
  } = deps;

  const sessions = new Map(); // sessionId → { cwd, lastSeen, hwnd, surface, hostPid }
  const deduper = createDeduperImpl(config.dedupWindowMs || 0);
  let idleTimer = null;

  function touchSession(sessionId) {
    const s = sessions.get(sessionId);
    if (s) s.lastSeen = now();
  }

  // 处理一个规范化事件。ctx 提供外部能力:
  //   bindWindow(event) → 绑定窗口句柄(entry:win32 桥,可异步)
  //   getForeground()   → 实时前台窗口 {hwnd,...}|null(entry:foreground.exe)
  //   getWindowMap()    → 保证新鲜的 hwnd→cwd 映射(entry:轮询)
  //   showToast(event)  → 触发通知(entry:spawn toast-agent)
  // 返回处理结果(测试断言用):'ignored'|'registered'|'unregistered'|'noop'|
  //   'silent-focused'|'silent-dedup'|'toast'
  async function handleEvent(event, ctx) {
    if (!event || typeof event !== 'object') return 'ignored';
    const t = now();
    if (event.sessionId) touchSession(event.sessionId);
    purgeStaleSessions(t);
    log('daemon', 'event', event.type, event.sessionId || '', event.cwd || '');

    if (event.type === 'session-start') {
      if (!event.sessionId) return 'ignored'; // 防 null 键锁死空闲退出
      let hwnd = 0;
      try { hwnd = ctx ? await ctx.bindWindow(event) : 0; } catch { /* 桥接失败 hwnd=0 */ }
      sessions.set(event.sessionId, {
        cwd: event.cwd || '', lastSeen: t, hwnd,
        surface: event.surface || 'claude', hostPid: event.hostPid || 0,
      });
      resetIdleIfEmpty();
      return 'registered';
    }
    if (event.type === 'session-end') {
      sessions.delete(event.sessionId);
      resetIdleIfEmpty();
      return 'unregistered';
    }
    if (!NOTIFY_TYPES.has(event.type)) return 'noop';
    if (!ctx) return 'toast';

    // 聚焦判定:事件到达时实时查询前台(无缓存陈旧 → 无假静默;无 1.6s 延迟 → 无误弹竞态)
    const fg = await ctx.getForeground();
    const fgHwnd = fg ? fg.hwnd : 0;
    const sessNow = event.sessionId ? sessions.get(event.sessionId) : null;
    // web 判定:会话表优先,事件自带 surface 兜底(daemon 重启后会话表为空仍可靠)
    const isWeb = (sessNow && sessNow.surface === 'web') || event.surface === 'web';
    // 浏览器窗口句柄是「窗口级」而非「tab 级」:同一 Edge 窗口内从 dsh tab 切到其他网站,
    // 句柄不变 → 句柄匹配会误判聚焦 → 假静默(2026-08-16 用户实测「toast 又不触发了」)。
    // web 会话的聚焦判据 = 前台是白名单浏览器且**标题含 DeepSeek Harness**(活动 tab 是 dsh);
    // 终端类(claude/tui)保持窗口句柄匹配(终端窗口即会话窗口)。
    const boundFocused = !isWeb && !!(sessNow && sessNow.hwnd && fgHwnd === sessNow.hwnd);
    const mappedFocused = decideFocus(fgHwnd, await ctx.getWindowMap(), event.cwd) === 'focused';
    // 浏览器兜底**仅对 web 事件生效**(2026-08-16 用户实测:tui 会话事件被误静默 —
    // 用户在看 dsh web 页面不代表在看 tui 终端);daemon 重启/绑定丢失时,
    // 前台 dsh 页 → web 事件静默;看其他网站 → 照常通知
    const fgIsDshBrowser = isWeb && !!fg && browserWhitelist.some((p) =>
      String(fg.processName || '').toLowerCase() === String(p).toLowerCase().replace(/\.exe$/i, '')
      && /deepseek harness/i.test(fg.title || ''));
    if (boundFocused || mappedFocused || fgIsDshBrowser) {
      log('daemon', '聚焦,静默', event.type, 'bound=' + (sessNow && sessNow.hwnd), 'dshBrowser=' + fgIsDshBrowser);
      return 'silent-focused';
    }
    // 去重:默认关闭(dedupWindowMs=0,失焦即每条通知);开启时按「会话:类型」
    if ((config.dedupWindowMs || 0) > 0
      && !deduper.shouldNotify((event.sessionId || '') + ':' + event.type)) {
      log('daemon', '去重跳过', event.type, event.sessionId || '');
      return 'silent-dedup';
    }
    await ctx.showToast(event);
    return 'toast';
  }

  // 会话过期清理:超过 TTL 未活跃的会话移除(异常退出兜底);清空后衔接空闲退出
  function purgeStaleSessions(t = now()) {
    const cutoff = t - sessionTtlMs;
    for (const [sid, sess] of sessions) {
      if (sess.lastSeen < cutoff) {
        log('daemon', '会话过期清理', sid);
        sessions.delete(sid);
      }
    }
    if (sessions.size === 0) resetIdleIfEmpty();
  }

  // 宿主存活清理(dsh hostPid 机制):宿主进程死亡 → 其会话不可能再活跃
  function checkHostLiveness() {
    for (const [sid, sess] of sessions) {
      if (sess.hostPid && !isPidAlive(sess.hostPid)) {
        log('daemon', '会话宿主已退出,清理', sid, 'hostPid=' + sess.hostPid);
        sessions.delete(sid);
      }
    }
    if (sessions.size === 0) resetIdleIfEmpty();
  }

  function resetIdleIfEmpty() {
    if (idleTimer) clearTimer(idleTimer);
    idleTimer = null;
    if (sessions.size > 0) return;
    idleTimer = setTimer(() => {
      log('daemon', '空闲超时退出');
      onIdle();
    }, idleMs);
  }

  return {
    handleEvent,
    checkHostLiveness,
    purgeStaleSessions,
    resetIdleIfEmpty,
    get sessions() { return sessions; },
  };
}
