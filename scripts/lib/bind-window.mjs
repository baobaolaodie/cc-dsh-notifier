// 会话窗口绑定决策 —— 纯函数,可注入依赖,便于真实场景矩阵单测。
// 从 daemon.mjs 的 bindWindow 原样抽取(2026-08-18 测试工程第一步,行为零变化):
// 输入 = session 事件 + 窗口枚举 + 前台窗口 + 白名单 + console 解析器;
// 输出 = 应绑定的窗口句柄 hwnd(0=绑定失败,由调用方兜底)。
//
// 关键设计:
//  - 与 daemon.mjs 完全同构同步改;daemon 只负责把真实依赖注入进来。
//  - resolveConsole(pid):dsh 用 hostPid 精确定位控制台窗口;测试注入 fake。
//  - 这个模块就是「把偶尔成功变必然成功」的验证面:所有场景矩阵都写在这里的测试里。
import { projectName } from './events.mjs';
import { isWhitelistedProcess, PROCESS_WHITELIST } from './window-map.mjs';
import { commandLineMatchesCwd } from './proc-dir.mjs';

// resolveConsole:(pid)=>Promise<number>,返回可见控制台/标签窗口 hwnd;测注入。
export async function bindWindow(event, deps) {
  const {
    entries = [],            // 窗口枚举(win32 桥 enumerate/poll 输出)
    foreground = [],         // 前台窗口数组(取第 0 个)
    terminalWhitelist = PROCESS_WHITELIST,
    browserWhitelist = [],
    resolveConsole = async () => 0,
  } = deps;
  // isWhitelistedProcess 依赖 Set.has;配置/测试可能传数组。统一归一化为 Set,不改变生产行为。
  const toSet = (v) => (v instanceof Set ? v : new Set(v));
  const terminalSet = toSet(terminalWhitelist);
  const browserSet = toSet(browserWhitelist);

  const eventCwd = event.cwd || '';

  // 1) web surface(dsh 浏览器 UI):绑定浏览器窗口。
  if (event.surface === 'web') {
    const isBrowser = (w) => isWhitelistedProcess(w.processName, browserSet);
    const hit = entries.find((w) => isBrowser(w) && /deepseek harness/i.test(w.title || ''));
    if (hit) return hit.hwnd;
    const fg = foreground[0];
    if (fg && isBrowser(fg)) return fg.hwnd;
    return 0;
  }

  // 2) dsh-tui 独立终端:优先用 hostPid(dsh 插件提供,可靠)精确绑定控制台/标签窗口。
  //    仅对 dsh(surface=tui)生效;Claude Code hook 拿不到可靠 hostPid。
  if (event.surface === 'tui' && event.hostPid) {
    const target = await resolveConsole(event.hostPid);
    if (target) return target;
    // resolveConsole 返回 0(如 VSCode 集成终端不可见伪控制台)→ 继续走标题/目录绑定
  }

  // 3) tui surface / Claude Code(无 surface 字段):终端窗口绑定。
  const base = projectName(eventCwd).toLowerCase();
  const titleMatches = (w) => base && isWhitelistedProcess(w.processName, terminalSet)
    && String(w.title || '').toLowerCase().includes(base);
  const dirMatches = (w) => isWhitelistedProcess(w.processName, terminalSet)
    && commandLineMatchesCwd(w.commandLine, eventCwd);
  const dirMatched = entries.filter((w) => dirMatches(w));
  // `?` 前缀标签是 Claude Code 动态标题特征,仅对 Claude Code 生效(dsh 带 surface=tui 不匹配)
  const isClaude = !event.surface || event.surface === 'claude';
  const ccTagDir = isClaude ? dirMatched.find((w) => /^\?\s/.test(w.title || '')) : undefined;
  if (ccTagDir) return ccTagDir.hwnd;
  // 关键顺序(2026-08-18 修复「VSCode Claude 被全局 ? 抢走」):
  // 1) 先标题含项目名精确命中(VSCode 的 Code 窗口标题必含项目名)→ 绑回 VSCode;
  // 2) 再全局 `?`(独立终端 Claude 标签,标题通常不含项目名时兜底);
  // 这样 VSCode 里的 Claude 不再被别的独立 `?` 标签抢走。
  for (const w of entries) {
    if (titleMatches(w)) return w.hwnd;
  }
  // 多 `?` 并存:优先前台 `?` 标签(通常是当前活跃会话所在标签),再回退第一个。
  const ccTags = isClaude ? entries.filter((w) => /^\?\s/.test(w.title || '')) : [];
  if (ccTags.length > 0) {
    const fgTag = foreground[0] && /^\?\s/.test(foreground[0].title || '') ? foreground[0] : null;
    return (fgTag || ccTags[0]).hwnd;
  }
  if (dirMatched.length > 0) return dirMatched[0].hwnd;
  const fg = foreground[0];
  if (fg && (dirMatches(fg) || titleMatches(fg) || (isClaude && /^\?\s/.test(fg.title || '')))) {
    return fg.hwnd;
  }
  return 0;
}
