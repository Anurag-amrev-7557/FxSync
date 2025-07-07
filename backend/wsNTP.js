// wsNTP.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 4000 });

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }
    if (data.type === 'NTP_REQUEST' && typeof data.t0 === 'number') {
      const t1 = Date.now();
      const t2 = Date.now();
      ws.send(JSON.stringify({
        type: 'NTP_RESPONSE',
        t0: data.t0,
        t1,
        t2
      }));
    }
    // ... handle other message types if needed ...
  });
});

console.log('NTP WebSocket server running on ws://localhost:4000'); 