#!/usr/bin/env node
/**
 * Test various Volcengine ASR WebSocket endpoints to find the working one.
 */

import WebSocket from 'ws';

const APP_ID = '7628583300';
const TOKEN = process.env.DOUBAO_ACCESS_TOKEN || 'P928EjcKlfMe4Zt07pwaapzvs8V9zdGO';

const PATHS = [
  '/api/v3/sauc/bigmodel_async',
  '/api/v3/asr/streaming',
  '/api/v3/asr/realtime',
  '/api/v3/sauc/streaming',
  '/api/v3/sauc/realtime',
  '/api/v3/recognize/streaming',
  '/api/v1/asr',
];

async function testPath(path) {
  return new Promise((resolve) => {
    const url = `wss://openspeech.bytedance.com${path}?request_id=test-${Date.now()}`;
    const ws = new WebSocket(url, { perMessageDeflate: false });

    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      resolve('TIMEOUT');
    }, 4000);

    ws.on('open', () => {
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve('OPEN ✓');
    });

    ws.on('unexpected-response', (req, res) => {
      clearTimeout(timer);
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        const short = body.slice(0, 120);
        if (res.statusCode === 404 && short.includes('does not exist')) {
          resolve('404 (not found)');
        } else {
          resolve(`${res.statusCode}: ${short}`);
        }
      });
    });

    ws.on('error', (e) => {
      clearTimeout(timer);
      resolve(`ERR: ${e.message}`);
    });
  });
}

console.log('Testing Volcengine ASR endpoints...\n');
console.log(`AppID: ${APP_ID}`);
console.log(`Token: ${TOKEN.slice(0,4)}...${TOKEN.slice(-4)}\n`);

for (const path of PATHS) {
  const result = await testPath(path);
  const status = result.includes('OPEN') ? '✅' : result.includes('400') ? '⚠️' : '❌';
  console.log(`${status} ${path.padEnd(35)} ${result}`);
}

// Also test: v1 with full_client_config as first WS message
console.log('\n--- Testing v1 with config payload after connect ---\n');

await new Promise((resolve) => {
  const url = `wss://openspeech.bytedance.com/api/v1/asr?request_id=v1-test-${Date.now()}`;
  const ws = new WebSocket(url);

  const timer = setTimeout(() => {
    try { ws.close(); } catch {}
    console.log('TIMEOUT');
    resolve();
  }, 8000);

  ws.on('open', () => {
    console.log('v1 WS OPEN! Sending config...');
    const config = JSON.stringify({
      type: 'full_client_config',
      app: { appid: APP_ID, token: TOKEN, cluster: 'volcengine_streaming_common' },
      user: { uid: 'test-mobileclaw-v1' },
      audio: { format: 'pcm', rate: 16000, channel: 1, bits: 16, language: 'zh-CN' },
      request: { reqid: `v1-${Date.now()}`, nbest: 1, result_type: 'full' },
    });
    ws.send(config);
    console.log('Config sent (' + config.length + ' bytes)');
  });

  ws.on('message', (data) => {
    const msg = String(data);
    console.log('v1 RECV:', msg.slice(0, 300));
  });

  ws.on('error', (e) => {
    console.log('v1 ERR:', e.message);
    clearTimeout(timer);
    resolve();
  });

  ws.on('close', (code, reason) => {
    console.log('v1 CLOSE:', code, reason.toString());
    clearTimeout(timer);
    resolve();
  });
});
