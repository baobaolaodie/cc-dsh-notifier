// 聚焦判定:前台窗口 hwnd → 映射表 → 与事件 cwd 比较
import { normalizeCwd } from './events.mjs';

export function decideFocus(fgHwnd, windowMap, eventCwd) {
  const mapped = windowMap.get(String(fgHwnd));
  if (mapped === undefined) return 'unfocused'; // 映射缺失:宁打扰勿漏
  return normalizeCwd(mapped) === normalizeCwd(eventCwd) ? 'focused' : 'unfocused';
}
