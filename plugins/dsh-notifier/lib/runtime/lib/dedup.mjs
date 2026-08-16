// 去重:同一 key 在 windowMs 窗口内合并(仅更新最后通知时间)。
// key 由调用方构造:Claude Code 单会话时代是「类型」;dsh 多会话并发时用「会话id:类型」,
// 否则多个会话同时触发同类事件(如同时等待输入)只会弹一条,另一个被吞
// (2026-08-16 用户反馈「多个会话同时进行」)。
export function createDeduper(windowMs = 10000) {
  const last = new Map(); // key → lastNotifiedAt
  return {
    shouldNotify(key) {
      const now = Date.now();
      const prev = last.get(key);
      last.set(key, now);
      if (prev === undefined) return true;
      return now - prev >= windowMs;
    },
  };
}
