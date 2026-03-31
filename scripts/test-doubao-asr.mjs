#!/usr/bin/env node
/**
 * test-doubao-asr.mjs
 *
 * 豆包/火山引擎 ASR WebSocket 连接测试（基于官方二进制协议）
 *
 * 认证方式：HTTP Headers（X-Api-App-Key / X-Api-Access-Key / X-Api-Resource-Id）
 * 协议：二进制帧（4字节header + 4字节seq/size + gzip压缩payload）
 * 端点：wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async（推荐优化版）
 *
 * Run: node scripts/test-doubao-asr.mjs
 */

import crypto from 'node:crypto';
import { gzip, ungzip } from 'pako';
import WebSocket from 'ws';

// ─── Configuration ──────────────────────────────────────────────

const APP_ID = process.env.DOUBAO_APP_ID || '7628583300';
const ACCESS_TOKEN = process.env.DOUBAO_ACCESS_TOKEN || 'P928EjcKlfMe4Zt07pwaapzvs8V9zdGO';
const RESOURCE_ID = 'volc.bigasr.sauc.duration';
const ENDPOINT = process.env.DOUBAO_ENDPOINT || 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';

let passed = 0;
let failed = 0;
let seq = 1;

function log(tag, msg) {
  console.log(`[${new Date().toLocaleTimeString()}] [${tag}] ${msg}`);
}

function pass(name) { passed++; log('PASS', name); }
function fail(name, err) { failed++; log('FAIL', `${name}: ${err}`); }

// ─── Binary Protocol (from official Python demo) ──────────────

// Message types
const MSG_TYPE = {
  CLIENT_FULL_REQUEST:    0b0001,
  CLIENT_AUDIO_REQUEST:   0b0010,
  SERVER_FULL_RESPONSE:   0b1001,
  SERVER_ERROR_RESPONSE:  0b1111,
};

// Flags for byte 1
const FLAGS = {
  NO_SEQUENCE:            0b0000,
  POS_SEQUENCE:           0b0001,
  NEG_SEQUENCE:           0b0010,
  NEG_WITH_SEQUENCE:      0b0011,
};

/** Build 4-byte binary header */
function buildHeader(msgType, specificFlags, serialization = 1, compression = 1) {
  // Byte 0: protocol version (4 bits) | header size (4 bits) → 0x11
  // Byte 1: message type (4 bits) | flags (4 bits)
  // Byte 2: serialization (4 bits) | compression (4 bits)
  // Byte 3: reserved
  const buf = Buffer.alloc(4);
  buf[0] = (0b0001 << 4) | 0b0001; // version 1, header size = 1 (4 bytes)
  buf[1] = (msgType << 4) | specificFlags;
  buf[2] = (serialization << 4) | compression;
  buf[3] = 0x00; // reserved
  return buf;
}

/** Build full client request frame (gzip-compressed JSON config) */
function buildFullClientRequest(payloadObj) {
  const jsonStr = JSON.stringify(payloadObj);
  const jsonBytes = Buffer.from(jsonStr, 'utf-8');
  const compressed = gzip(jsonBytes);

  const header = buildHeader(MSG_TYPE.CLIENT_FULL_REQUEST, FLAGS.POS_SEQUENCE);
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(seq++);
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(compressed.length);

  return Buffer.concat([header, seqBuf, sizeBuf, compressed]);
}

/** Build audio-only request frame (gzip-compressed PCM data) */
function buildAudioRequest(pcmData, isLast = false) {
  const compressed = gzip(pcmData);
  const flags = isLast ? FLAGS.NEG_WITH_SEQUENCE : FLAGS.POS_SEQUENCE;
  const actualSeq = isLast ? -seq : seq;
  if (!isLast) seq++;

  const header = buildHeader(MSG_TYPE.CLIENT_AUDIO_REQUEST, flags);
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(actualSeq);
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(compressed.length);

  return Buffer.concat([header, seqBuf, sizeBuf, compressed]);
}

/** Build finish signal (last audio packet with empty payload) */
function buildFinishRequest() {
  return buildAudioRequest(Buffer.alloc(0), true);
}

/** Parse server response frame */
function parseResponse(data) {
  if (data.length < 5) return null;

  const headerSize = (data[0] & 0x0f); // in 4-byte units
  const msgType = (data[1] >> 4) & 0x0f;
  const flags = data[1] & 0x0f;
  const serialization = (data[2] >> 4) & 0x0f;
  const compression = data[2] & 0x0f;

  let offset = headerSize * 4;
  let responseSeq = null;
  let isLast = false;

  if (flags & 0x01) {
    responseSeq = data.readInt32BE(offset); offset += 4;
  }
  if (flags & 0x02) isLast = true;

  let errorCode = null;
  let errorSize = 0;
  let payloadSize = 0;

  if (msgType === MSG_TYPE.SERVER_FULL_RESPONSE) {
    payloadSize = data.readUInt32BE(offset); offset += 4;
  } else if (msgType === MSG_TYPE.SERVER_ERROR_RESPONSE) {
    errorCode = data.readInt32BE(offset); offset += 4;
    errorSize = data.readUInt32BE(offset); offset += 4;
  }

  let payload = data.slice(offset);

  // Decompress if gzip
  if (compression === 1 && payload.length > 0) {
    try {
      payload = ungzip(payload);
    } catch (e) {
      return { msgType, errorCode, errorSize, payload: null, parseError: e.message };
    }
  }

  // Parse JSON
  let json = null;
  if (serialization === 1 && payload.length > 0) {
    try {
      json = JSON.parse(payload.toString('utf-8'));
    } catch {}
  }

  return { msgType, flags, responseSeq, isLast, errorCode, errorSize, payloadSize, payload, json };
}

// ─── Test Runner ───────────────────────────────────────────────

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Doubao ASR Connection Test (Official Binary Protocol)     ║');
  console.log(`║     AppID: ${APP_ID}                    ║`);
  console.log(`║     Token: ${ACCESS_TOKEN.slice(0,4)}...${ACCESS_TOKEN.slice(-4)}              ║`);
  console.log(`║     Resource: ${RESOURCE_ID}          ║`);
  console.log(`║     Endpoint: ${ENDPOINT.replace('wss://', '')} ║`);
  console.log('╚═════════════════════════════════════════════════════════╝\n');

  await testConnectionAndConfig();
  await testAudioRecognition();

  console.log('\n╔═════════════════════════════════════════════════════════╗');
  console.log(`║  Total: ${passed + failed}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}   ║`);
  console.log('╚═════════════════════════════════════════════════════════╝\n');

  if (failed > 0) process.exit(1);
}

// ─── Test 1: Connection + Config Handshake ─────────────────────

async function testConnectionAndConfig() {
  console.log('--- Test 1: WS Connect + Binary Config Handshake ---\n');

  return new Promise((resolve) => {
    const connectId = crypto.randomUUID();
    const ws = new WebSocket(ENDPOINT, {
      headers: {
        'X-Api-App-Key': APP_ID,
        'X-Api-Access-Key': ACCESS_TOKEN,
        'X-Api-Resource-Id': RESOURCE_ID,
        'X-Api-Connect-Id': connectId,
        'X-Api-Request-Id': connectId,
      },
      perMessageDeflate: false,
    });

    ws.on('open', () => {
      pass('WebSocket connected with HTTP header auth');
      log('AUTH', `Headers sent: AppKey=${APP_ID}, Resource=${RESOURCE_ID}`);

      // Send full client request (binary protocol)
      const configPayload = {
        user: { uid: 'test-mobileclaw-node', did: 'rn-app', platform: 'ReactNative', sdk_version: '1.0.0' },
        audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
        request: {
          model_name: 'bigmodel',
          enable_itn: true,
          enable_punc: true,
          enable_ddc: false,
          show_utterances: true,
          result_type: 'full',
          end_window_size: 800,
          force_to_speech_time: 1000,
        },
      };

      const frame = buildFullClientRequest(configPayload);
      log('CONFIG', `Sending binary full_client request (${frame.byteLength} bytes, seq=1)`);
      ws.send(frame);
    });

    ws.on('message', (data) => {
      const resp = parseResponse(data instanceof Buffer ? data : Buffer.from(data));
      if (!resp) {
        log('RECV', '(raw, too short)');
        return;
      }

      if (resp.msgType === MSG_TYPE.SERVER_FULL_RESPONSE) {
        const text = resp.json?.result?.text || '';
        const utterances = resp.json?.result?.utterances || [];
        log('RESP', `Server response (seq=${resp.responseSeq}, last=${resp.isLast}, size=${resp.payloadSize})`);
        if (text) log('TEXT', `"${text}"`);
        if (utterances.length > 0) {
          utterances.forEach((u, i) => {
            log('UTT', `[${i}] "${u.text}" definite=${!!u.definite}`);
          });
        }
        pass('Config acknowledged — received server response');
        clearTimeout(timeout);
        ws.close();
        resolve();
      } else if (resp.msgType === MSG_TYPE.SERVER_ERROR_RESPONSE) {
        fail('Server error response', `${resp.errorCode}: ${resp.payload?.toString().slice(0, 200)}`);
        clearTimeout(timeout);
        ws.close();
        resolve();
      } else {
        log('RECV', `Unexpected type=${resp.msgType}, flags=${resp.flags}, json=${JSON.stringify(resp.json).slice(0, 150)}`);
      }
    });

    ws.on('error', (err) => {
      fail('WebSocket error', err.message);
      resolve();
    });

    ws.on('close', (code, reason) => {
      log('WS', `Closed: code=${code} reason=${reason}`);
      resolve();
    });

    const timeout = setTimeout(() => {
      fail('Test 1 timeout', 'No server response within 10s');
      ws.close();
      resolve();
    }, 10000);
  });
}

// ─── Test 2: Audio Recognition with Simulated PCM ─────────────

async function testAudioRecognition() {
  console.log('\n--- Test 2: Simulated PCM Audio Stream ---\n');

  return new Promise((resolve) => {
    const connectId = crypto.randomUUID();
    seq = 1; // Reset seq for this test

    const ws = new WebSocket(ENDPOINT, {
      headers: {
        'X-Api-App-Key': APP_ID,
        'X-Api-Access-Key': ACCESS_TOKEN,
        'X-Api-Resource-Id': RESOURCE_ID,
        'X-Api-Connect-Id': connectId,
      },
      perMessageDeflate: false,
    });

    let receivedResults = [];
    let gotDefiniteResult = false;
    const TEST_DURATION_MS = 12000; // 12s of audio
    const FRAME_INTERVAL_MS = 200; // 200ms per chunk (recommended optimal)
    const SAMPLE_RATE = 16000;
    const CHANNELS = 1;
    const BITS = 16;
    const BYTES_PER_SAMPLE = CHANNELS * (BITS / 8);
    const FRAME_SIZE = Math.floor(SAMPLE_RATE * (FRAME_INTERVAL_MS / 1000) * BYTES_PER_SAMPLE); // 6400 bytes = 200ms

    const cleanup = () => {
      clearInterval(pcmTimer);
      clearTimeout(finishTimer);
      clearTimeout(testTimeout);
    };

    const testTimeout = setTimeout(() => {
      log('WARN', 'Test timeout — summarizing...');
      summarize();
    }, TEST_DURATION_MS + 5000);

    const finishTimer = setTimeout(() => {
      log('AUDIO', 'Sending finish signal (negative sequence)...');
      try { ws.send(buildFinishRequest()); } catch {}
      setTimeout(summarize, 3000);
    }, TEST_DURATION_MS);

    // Generate and send simulated PCM every 200ms
    const pcmTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;

      // Generate low-amplitude noise (simulating silence/mic input)
      const pcm = Buffer.alloc(FRAME_SIZE);
      for (let i = 0; i < FRAME_SIZE / 2; i++) {
        // Very quiet noise (~-40dB)
        const sample = Math.floor((Math.random() - 0.5) * 50);
        pcm.writeInt16LE(sample, i * 2);
      }

      const frame = buildAudioRequest(pcm, false);
      try { ws.send(frame); } catch {}
    }, FRAME_INTERVAL_MS);

    function summarize() {
      cleanup();

      if (gotDefiniteResult) pass('Received definite (final) ASR result');
      else if (receivedResults.length > 0) pass(`Received ${receivedResults.length} interim result(s)`);
      else fail('No ASR results', 'Server accepted audio but no transcripts. May need real speech.');

      if (receivedResults.length > 0) {
        log('INFO', 'All recognized texts:');
        receivedResults.forEach((r, i) => log(`  [${i}]`, JSON.stringify(r).slice(0, 200)));
      }

      try { ws.close(); } catch {}
      resolve();
    }

    ws.on('open', () => {
      pass('Test2: WebSocket connected with auth headers');

      // Send config
      const configPayload = {
        user: { uid: 'test-mobileclaw-audio', did: 'rn-app', platform: 'ReactNative', sdk_version: '1.0.0' },
        audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
        request: {
          model_name: 'bigmodel',
          enable_itn: true,
          enable_punc: true,
          show_utterances: true,
          result_type: 'full',
          end_window_size: 800,
          force_to_speech_time: 1000,
        },
      };

      ws.send(buildFullClientRequest(configPayload));
      log('TEST2', 'Config sent, starting PCM stream (200ms chunks, 12s max)...');
    });

    ws.on('message', (data) => {
      const resp = parseResponse(data instanceof Buffer ? data : Buffer.from(data));
      if (!resp) return;

      if (resp.msgType === MSG_TYPE.SERVER_FULL_RESPONSE) {
        const text = resp.json?.result?.text || '';
        const utterances = resp.json?.result?.utterances || [];

        // Check for definite (final) results
        const definiteUtterances = utterances.filter(u => u.definite);
        if (definiteUtterances.length > 0 && !gotDefiniteResult) {
          gotDefiniteResult = true;
          const finalText = definiteUtterances.map(u => u.text).join('');
          pass(`Definite result: "${finalText}"`);
        }

        // Track all interim results
        if (text && !gotDefiniteResult) {
          const isNew = !receivedResults.some(r => r.text === text);
          if (isNew) {
            receivedResults.push({ text, seq: resp.responseSeq });
            log('INTERIM', `"${text}"${utterances.length > 0 ? ` (${utterances.filter(u=>!u.definite).length} pending)` : ''}`);
          }
        }

        if (resp.isLast) {
          log('DONE', 'Server indicated last package');
          setTimeout(summarize, 1000);
        }
      } else if (resp.msgType === MSG_TYPE.SERVER_ERROR_RESPONSE) {
        log('ERROR', `Code ${resp.errorCode}: ${resp.payload?.toString().slice(0, 200)}`);
      }
    });

    ws.on('error', (err) => {
      fail('Test2 error', err.message);
      cleanup();
      resolve();
    });

    ws.on('close', () => {
      if (!gotDefiniteResult && receivedResults.length === 0) {
        summarize();
      }
    });
  });
}

// ─── Run ─────────────────────────────────────────────────────────

runTests().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
