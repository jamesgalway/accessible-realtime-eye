const { handleWebSocketUpgrade } = require('../../server');

module.exports = (req, res) => {
  const wantsUpgrade = String(req.headers.upgrade || '').toLowerCase() === 'websocket';
  if (!wantsUpgrade || !req.socket) {
    res.writeHead(426, {
      'Content-Type': 'application/json; charset=utf-8',
      'Upgrade': 'websocket'
    });
    res.end(JSON.stringify({
      ok: false,
      error: '这个接口只接受 WebSocket 连接。'
    }));
    return;
  }

  handleWebSocketUpgrade(req, req.socket);
};
