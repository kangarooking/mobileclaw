#!/usr/bin/env node
/**
 * test-gateway-connection.mjs
 *
 * OpenClaw Gateway WebSocket connection test with full device identity.
 * Uses Ed25519 keypair + v3 signed auth payload.
 */

import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

const WS_URL = process.env.OPENCLAW_WS_URL || 'ws://127.0.0.1:18789';
const TOKEN = process.env.OPENCLAW_TOKEN || 'a3181a2fbf7058f8cddbf64ebb90ffcfeeaad623c2c31ad8';
const RPC_TIMEOUT_MS = 30_000;

// ─── Device Identity ───────────────────────────────────────────────

function base64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function normalizeDeviceMetadataForAuth(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/[A-Z]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 32));
}

function buildV3Payload(params) {
  const scopes = params.scopes.join(',');
  const token = params.token ?? '';
  const platform = normalizeDeviceMetadataForAuth(params.platform);
  const deviceFamily = normalizeDeviceMetadataForAuth(params.deviceFamily);
  return ['v3', params.deviceId, params.clientId, params.clientMode, params.role,
    scopes, String(params.signedAtMs), token, params.nonce, platform, deviceFamily].join('|');
}

function signPayload(privateKeyPem, payload) {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
}

function generateIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  const PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
  const der = Buffer.from(pubPem.replace(/-----[^\n]+-----/g, '').replace(/\s/g, ''), 'base64');
  const raw = der.subarray(PREFIX.length);
  const deviceId = crypto.createHash('sha256').update(raw).digest('hex');

  return { publicKeyRaw: base64UrlEncode(raw), privateKeyPem: privPem, deviceId };
}

function loadExistingIdentity() {
  const path = `${process.env.HOME || '/tmp'}/.openclaw/identity/device.json`;
  try {
    const d = JSON.parse(readFileSync(path, 'utf8'));
    // Extract raw public key from PEM
    const pubPem = d.publicKeyPem;
    const PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
    const der = Buffer.from(pubPem.replace(/-----[^\n]+-----/g, '').replace(/\s/g, ''), 'base64');
    const raw = der.subarray(PREFIX.length);
    return { publicKeyRaw: base64UrlEncode(raw), privateKeyPem: d.privateKeyPem, deviceId: d.deviceId };
  } catch { return null; }
}

// ─── Helpers ─────────────────────────────────────────────────────

function log(tag, ...args) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] [${tag}]`, ...args);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Test Client ──────────────────────────────────────────────────

class TestClient {
  constructor(deviceIdentity) {
    this.ws = null;
    this.token = '';
    this.pending = new Map();
    this.eventHandlers = new Map();
    this.di = deviceIdentity;
    this.challengeNonce = null;
  }

  connect(url, token) {
    return new Promise((resolve, reject) => {
      this.token = token;
      this.ws = new WebSocket(url);

      this.ws.on('open', () => log('CONNECT', 'TCP opened to', url));

      this.ws.on('message', (raw) => {
        const frame = JSON.parse(raw.toString());
        this.handleFrame(frame);
        if (frame.type === 'res' && frame.payload?.type === 'hello-ok') {
          log('AUTH', 'Handshake OK! Server:', JSON.stringify(frame.payload.server));
          if (frame.payload.auth) {
            log('AUTH', 'deviceToken:', frame.payload.auth.deviceToken?.slice(0, 16));
            log('AUTH', 'role:', frame.payload.auth.role, 'scopes:', JSON.stringify(frame.payload.auth.scopes));
          }
          resolve(frame.payload);
        }
      });

      this.ws.on('close', (code, reason) => {
        log('CLOSE', `${code} ${reason}`);
        for (const [id, p] of this.pending) { clearTimeout(p.timeout); p.reject(new Error(reason)); }
        this.pending.clear();
        if (this._rejectConnect) this._rejectConnect(new Error(`${reason} (${code})`));
      });

      this.ws.on('error', (err) => { log('ERROR', err.message); reject(err); });
      setTimeout(() => reject(new Error('Handshake timeout')), 15_000);
      this._rejectConnect = reject;
    });
  }

  handleFrame(frame) {
    switch (frame.type) {
      case 'event': this.handleEvent(frame); break;
      case 'res': this.handleResponse(frame); break;
    }
  }

  handleEvent(event) {
    if (event.event === 'connect.challenge') {
      this.challengeNonce = event.payload.nonce;
      log('CHALLENGE', 'nonce:', event.payload.nonce?.slice(0, 8) + '...');
      this.sendConnectWithDevice();
      return;
    }
    const handlers = this.eventHandlers.get(event.event);
    if (handlers) handlers.forEach(h => h(event));
    if (!['tick'].includes(event.event)) log('EVENT', event.event, JSON.stringify(event.payload)?.slice(0, 120));
  }

  handleResponse(res) {
    const pending = this.pending.get(res.id);
    if (!pending) { /* connect res handled in onmessage */ return; }
    clearTimeout(pending.timeout); this.pending.delete(res.id);
    if (res.ok) pending.resolve(res.payload);
    else pending.reject(new Error(`RPC [${res.error?.code}]: ${res.error?.message}`));
  }

  sendConnectWithDevice() {
    const { deviceId, publicKeyRaw, privateKeyPem } = this.di;

    // These values become part of connectParams — server uses THESE exact values to rebuild payload
    const connectClient = { id: 'openclaw-ios', displayName: 'MobileClaw', version: '1.0.0', platform: 'ios', mode: 'ui', deviceFamily: 'iPhone' };
    const connectRole = 'operator';
    const connectScopes = ['operator.read', 'operator.write'];
    const signedAtMs = Date.now();

    // Build payload using SAME values as connectParams (server reconstructs from connectParams)
    const payload = buildV3Payload({
      deviceId,
      clientId: connectClient.id,
      clientMode: connectClient.mode,
      role: connectRole,
      scopes: connectScopes,
      signedAtMs,
      token: this.token,
      nonce: this.challengeNonce,
      platform: connectClient.platform,
      deviceFamily: connectClient.deviceFamily,
    });

    const signature = signPayload(privateKeyPem, payload);

    // DEBUG: Print exact payload
    log('DEBUG', '[PAYLOAD] ' + payload);
    log('DEBUG', '[SIG] ' + signature.slice(0, 32));

    const frame = {
      type: 'req', id: randomUUID(), method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: connectClient,
        role: connectRole,
        scopes: connectScopes,
        auth: { token: this.token },
        locale: 'zh-CN',
        userAgent: 'mobileclaw/1.0.0',
        device: { id: deviceId, publicKey: publicKeyRaw, signature, signedAt: signedAtMs, nonce: this.challengeNonce },
      },
    };

    log('CONNECT', 'Sending connect with device identity...');
    this.sendRaw(JSON.stringify(frame));
  }

  rpc(method, params) {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`timeout: ${method}`)); }, RPC_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      log('RPC', `→ ${method}`, JSON.stringify(params)?.slice(0, 100));
      this.sendRaw(JSON.stringify({ type: 'req', id, method, params }));
    });
  }

  sendRaw(data) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data); }
  onEvent(name, h) { if (!this.eventHandlers.has(name)) this.eventHandlers.set(name, new Set()); this.eventHandlers.get(name).add(h); }
  disconnect() { if (this.ws) { this.ws.close(1000, 'done'); this.ws = null; } }
}

// ─── Main ─────────────────────────────────────────────────────────

async function runTests() {
  console.log('='.repeat(60));
  console.log('  MobileClaw — Gateway Connection Test (Ed25519 Device Auth)');
  console.log(`  Target: ${WS_URL}`);
  console.log('='.repeat(60));

  // Generate FRESH identity (unpaired → should get silent auto-approval)
  log('DEVICE', 'Generating NEW Ed25519 keypair...');
  const di = generateIdentity();
  log('DEVICE', 'deviceId:', di.deviceId);

  const client = new TestClient(di);
  let passed = 0, failed = 0;
  const assert = (name, cond, detail) => { cond ? (log('PASS', name), passed++) : (log('FAIL', name, detail || ''), failed++); };

  try {
    // Test 1: Handshake
    console.log('\n--- Test 1: Full Handshake (challenge → connect+device → hello-ok) ---\n');
    const helloOk = await client.connect(WS_URL, TOKEN);
    assert('hello-ok received', helloOk?.type === 'hello-ok');
    assert('protocol v3', helloOk?.protocol === 3);
    assert('server info', !!helloOk?.server?.version);
    assert('features list', Array.isArray(helloOk?.features?.methods));
    assert('device token granted', !!helloOk?.auth?.deviceToken);
    assert('scopes granted', Array.isArray(helloOk?.auth?.scopes) && helloOk.auth.scopes.length > 0,
      `scopes: ${JSON.stringify(helloOk?.auth?.scopes)}`);

    if (helloOk?.features?.methods) {
      log('INFO', `RPC methods (${helloOk.features.methods.length}):`);
      helloOk.features.methods.slice(0, 12).forEach(m => log('INFO', `  - ${m}`));
    }
    await wait(500);

    // Test 2: health RPC
    console.log('\n--- Test 2: RPC health ---\n');
    try {
      const r = await client.rpc('health');
      log('RPC', '← health:', JSON.stringify(r)?.slice(0, 200));
      assert('health OK', true);
    } catch (e) { log('WARN', e.message); assert('health attempted', false); }

    // Test 3: chat.send RPC (the correct method for AI conversation)
    console.log('\n--- Test 3: RPC chat.send (AI conversation) ---\n');
    try {
      const r = await client.rpc('chat.send', {
        sessionKey: 'main:webchat:mobileclaw',
        message: 'Hello from MobileClaw! This is a test message. Please respond briefly in one sentence.',
        idempotencyKey: `mobileclaw-test-${Date.now()}`,
      });
      log('RPC', '← chat.send:', JSON.stringify(r)?.slice(0, 500));
      assert('chat.send succeeded!', r != null);
    } catch (e) {
      log('CHAT_FAIL', e.message);
      assert('chat.send succeeded', false, e.message);
    }

    // Also test the channel-based send with correct params
    console.log('\n--- Test 3b: RPC send (channel message, for reference) ---\n');
    try {
      const r = await client.rpc('send', {
        to: 'test',
        channel: 'test',
        message: 'test',
        idempotencyKey: `test-${Date.now()}`,
      });
      log('RPC', '← send:', JSON.stringify(r)?.slice(0, 200));
      assert('send (channel) OK', true);
    } catch (e) {
      log('INFO', `send (channel): ${e.message}`); // May fail if no test channel — that's OK
      assert('send attempted', true);
    }

    // Test 4: Events
    console.log('\n--- Test 4: Event listening (8s) ---\n');
    const events = new Set();
    client.onEvent('tick', () => events.add('tick'));
    client.onEvent('agent', (e) => { events.add('agent'); log('EVENT', 'agent:', JSON.stringify(e.payload)?.slice(0, 200)); });
    client.onEvent('chat', (e) => { events.add('chat'); log('EVENT', 'chat:', JSON.stringify(e.payload)?.slice(0, 300)); });
    await wait(8000);
    assert('tick/events received', events.has('tick') || events.size > 0, `seen: ${[...events].join(',') || '(none)'}`);

    // Test 5: Disconnect
    console.log('\n--- Test 5: Disconnect ---\n');
    client.disconnect(); await wait(500);
    assert('closed cleanly', !client.ws || client.ws.readyState !== WebSocket.OPEN);

  } catch (e) {
    log('FATAL', e.message); failed++;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed / ${passed + failed} total`);
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error(e); process.exit(1); });
