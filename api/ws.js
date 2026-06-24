const http = require('node:http');
const { createBrowserRealtimeServer } = require('../server');

const realtimeServer = createBrowserRealtimeServer();

const server = http.createServer((req, res) => {
  res.writeHead(426, {
    'Content-Type': 'application/json; charset=utf-8',
    'Upgrade': 'websocket'
  });
  res.end(JSON.stringify({
    ok: false,
    error: '这个接口只接受 WebSocket 连接。'
  }));
});

server.on('upgrade', (req, socket, head) => {
  realtimeServer.handleUpgrade(req, socket, head, (browserSocket) => {
    realtimeServer.emit('connection', browserSocket, req);
  });
});

module.exports = server;
