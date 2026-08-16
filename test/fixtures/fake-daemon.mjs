// 伪 daemon:供 dsh-forwarder 测试使用
// 写入 CCN_STATE_FILE({port,pid}),HTTP 服务把 /event 追加到 CCN_EVENT_LOG;5s 后自动退出
import http from 'node:http';
import fs from 'node:fs';

const stateFile = process.env.CCN_STATE_FILE;
const logFile = process.env.CCN_EVENT_LOG;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/event') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { fs.appendFileSync(logFile, body + '\n'); } catch { /* 日志失败忽略 */ }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    });
  } else {
    res.writeHead(200).end('ok');
  }
});

server.listen(0, '127.0.0.1', () => {
  try { fs.writeFileSync(stateFile, JSON.stringify({ port: server.address().port, pid: process.pid })); } catch { /* 忽略 */ }
  setTimeout(() => process.exit(0), 5000); // 测试用:5s 后自动退出,避免孤儿
});
