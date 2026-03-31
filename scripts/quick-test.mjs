import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

// Load existing openclaw identity
const device = JSON.parse(readFileSync('/Users/kangarooking/.openclaw/identity/device.json', 'utf8'));
console.log('Loaded existing identity, deviceId:', device.deviceId.slice(0, 16));

// Extract raw public key
const pubPem = device.publicKeyPem;
const spkiDer = Buffer.from(
  pubPem.replace(/-----BEGIN PUBLIC KEY-----/, '').replace(/-----END PUBLIC KEY-----/, '').replace(/\s/g, ''),
  'base64',
);
const prefix = Buffer.from('302a300506032b6570032100', 'hex');
const rawPub = spkiDer.subarray(prefix.length);
console.log('Raw pubkey length:', rawPub.length, 'bytes');

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Build v3 payload
const nonce = 'test-nonce-debug';
const payload = [
  'v3', device.deviceId, 'openclaw-ios', 'ui', 'operator',
  'operator.read,operator.write', String(Date.now()),
  'a3181a2fbf7058f8cddbf64ebb90ffcfeeaad623c2c31ad8',
  nonce, 'ios', 'iPhone',
].join('|');
console.log('\nPayload:', payload);

// Sign with existing private key
const key = crypto.createPrivateKey(device.privateKeyPem);
const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), key);
const b64sig = b64url(sig);
console.log('Signature:', b64sig.slice(0, 32));

// Self-verify (same as openclaw server does)
const verifyKey = crypto.createPublicKey({ key: Buffer.concat([prefix, rawPub]), type: 'spki', format: 'der' });
const ok = crypto.verify(null, Buffer.from(payload, 'utf8'), verifyKey, sig);
console.log('Self-verify with existing identity:', ok ? 'PASS ✓' : 'FAIL ✗');

// Also verify using the raw base64url public key format (how server receives it)
const pubB64Url = b64url(rawPub);
const verifyKey2 = crypto.createPublicKey({ key: Buffer.concat([prefix, Buffer.from(pubB64Url, 'base64url')]), type: 'spki', format: 'der' });
const ok2 = crypto.verify(null, Buffer.from(payload, 'utf8'), verifyKey2, sig);
console.log('Self-verify via b64url pubkey:', ok2 ? 'PASS ✓' : 'FAIL ✗');

// Now test: sign a payload, then verify with WRONG payload (simulating server-side mismatch)
const wrongPayload = payload.replace('iPhone', 'android');
const ok3 = crypto.verify(null, Buffer.from(wrongPayload, 'utf8'), verifyKey, sig);
console.log('Verify wrong payload (should FAIL):', ok3 ? 'UNEXPECTED PASS' : 'FAIL ✗ (expected)');
