// daemon 重启检测与会话重注册(2026-08-16,用户反馈"新建会话不换 daemon"误导):
// daemon 是单实例 —— 只有它死了才会被新事件拉起;daemon 重启后内存会话表清空,
// 宿主不会重发 session-start,绑定/聚焦判定会退化。
// 本模块:检测 daemon pid 变化(重启),触发 onNewDaemon 回调(插件据此重发全部 session-start)。
export function createDaemonResync({ readState, isPidAlive, onNewDaemon }) {
  let lastPid = 0;
  return () => {
    const s = readState();
    const pid = s && isPidAlive(s.pid) ? s.pid : 0;
    if (pid && pid !== lastPid) {
      lastPid = pid;
      onNewDaemon(pid);
      return true;
    }
    return false;
  };
}
