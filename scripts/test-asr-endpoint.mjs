import WebSocket from 'ws';

const urls = [
  'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async?resource_id=volc.bigasr.sauc.duration',
  'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async/volc.bigasr.sauc.duration',
];

async function testUrl(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => { ws.close(); resolve('TIMEOUT'); }, 5000);
    ws.on('open', () => { clearTimeout(timer); ws.close(); resolve('OPEN'); });
    ws.on('error', (e) => { clearTimeout(timer); resolve('ERR: ' + e.message); });
    ws.on('unexpected-response', (req, res) => {
      clearTimeout(timer);
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(res.statusCode + ': ' + body.slice(0, 150)));
    });
  });
}

for (const u of urls) {
  const label = u.replace('wss://openspeech.bytedance.com/', '');
  const result = await testUrl(u);
  console.log(label + ' => ' + result);
}
