// 去重:同类型事件在 windowMs 窗口内合并(仅更新最后通知时间)
export function createDeduper(windowMs = 10000) {
  const last = new Map(); // eventType → lastNotifiedAt
  return {
    shouldNotify(type) {
      const now = Date.now();
      const prev = last.get(type);
      last.set(type, now);
      if (prev === undefined) return true;
      return now - prev >= windowMs;
    },
  };
}
