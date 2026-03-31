#!/usr/bin/env node
/**
 * debug-signature.mjs
 *
 * Debug script: generates Ed25519 keypair, builds payload exactly as server would,
 * signs it, then verifies locally. Also prints exact payload for comparison.
 */

import crypto from 'node:crypto';

// ─── Config ──────────────────────────────────────────────────────

const TOKEN = 'a3181a2fbf7058f8cddbf64ebb90ffcfeeaad623c2c31ad8';
const NONCE = 'test-nonce-12345'; // Simulated challenge nonce

// ─── Device Identity (Ed25519) ───────────────────────────────────

function generateDeviceIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
  const spkiDer = Buffer.from(
    publicKeyPem.replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s/g, ''),
    'base64',
  );

  let rawPublicKey;
  if (
    spkiDer.length === ED25519_SPKI_PREFIX.length + 32 &&
    spkiDer.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    rawPublicKey = spkiDer.subarray(ED25519_SPKI_PREFIX.length);
  } else {
    throw new Error('Failed to extract raw Ed25519 public key');
  }

  const deviceId = crypto.createHash('sha256').update(rawPublicKey).digest('hex');

  return {
    publicKeyRaw: base64UrlEncode(rawPublicKey),
    privateKeyPem,
    publicKeyPem,
    deviceId,
  };
}

function base64UrlEncode(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ─── normalizeDeviceMetadataForAuth (matches openclaw server) ─────

function normalizeDeviceMetadataForAuth(value) {
  if (!value) return '';
  const trimmed = value.trim();
  // Lowercase ASCII only (A-Z -> a-z), leave non-ASCII untouched
  return trimmed.replace(/[A-Z]/g, (ch) => ch.toLowerCase());
}

// ─── Build v3 payload (matches openclaw's buildDeviceAuthPayloadV3) ──

function buildV3Payload(params) {
  const scopes = params.scopes.join(',');
  const token = params.token ?? '';
  const platform = normalizeDeviceMetadataForAuth(params.platform);
  const deviceFamily = normalizeDeviceMetadataForAuth(params.deviceFamily);
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    deviceFamily,
  ].join('|');
}

// ─── Sign & Verify (matches openclaw's signDevicePayload / verifyDeviceSignature) ──

function signPayload(privateKeyPem, payload) {
  const key = crypto.createPrivateKey(privateKeyPem);
  const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), key);
  return base64UrlEncode(sig);
}

function verifySignature(publicKeyRawBase64Url, payload, signatureBase64Url) {
  try {
    // Match openclaw's verifyDeviceSignature: raw b64url key → prepend SPKI prefix
    const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
    const rawKeyBytes = (() => {
      try { return Buffer.from(publicKeyRawBase64Url, 'base64url'); }
      catch { return Buffer.from(publicKeyRawBase64Url, 'base64'); }
    })();
    const key = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawKeyBytes]),
      type: 'spki',
      format: 'der',
    });

    const sigBytes = (() => {
      try { return Buffer.from(signatureBase64Url, 'base64url'); }
      catch { return Buffer.from(signatureBase64Url, 'base64'); }
    })();

    return crypto.verify(null, Buffer.from(payload, 'utf8'), key, sigBytes);
  } catch (e) {
    console.error('Verification error:', e.message);
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────

console.log('=== OpenClaw Device Identity Signature Debug ===\n');

// 1. Generate identity
const identity = generateDeviceIdentity();
console.log('[Identity]');
console.log(`  deviceId: ${identity.deviceId}`);
console.log(`  publicKeyRaw (b64url): ${identity.publicKeyRaw.slice(0, 32)}...`);
console.log(`  publicKeyPem:\n${identity.publicKeyPem}`);

// 2. Build payload EXACTLY as server would reconstruct it
//    IMPORTANT: The values must match what we send in connectParams!
const connectParams = {
  client: {
    id: 'openclaw-ios',
    mode: 'ui',
    platform: 'ios',
    // NOTE: If we DON'T send deviceFamily in connectParams,
    // the server uses undefined → "" in the payload!
    // deviceFamily: 'iPhone',  // <-- ONLY include if also in connectParams.client!
  },
  auth: { token: TOKEN },
};

const signedAtMs = Date.now();

const payloadV3 = buildV3Payload({
  deviceId: identity.deviceId,
  clientId: connectParams.client.id,
  clientMode: connectParams.client.mode,
  role: 'operator',
  scopes: ['operator.read', 'operator.write'],
  signedAtMs,
  token: connectParams.auth.token,
  nonce: NONCE,
  platform: connectParams.client.platform,
  deviceFamily: connectParams.client.deviceFamily, // MUST match connectParams!
});

console.log('\n[Payload v3] (what server reconstructs):');
console.log(`  "${payloadV3}"`);
console.log(`  Length: ${payloadV3.length} chars`);

// 3. Sign
const signature = signPayload(identity.privateKeyPem, payloadV3);
console.log('\n[Signature]');
console.log(`  (b64url): ${signature.slice(0, 32)}...`);

// 4. Local self-verify
const verified = verifySignature(identity.publicKeyRaw, payloadV3, signature);
console.log('\n[Local Verification]');
console.log(`  Self-verify result: ${verified ? 'PASS ✓' : 'FAIL ✗'}`);

// 5. Test: What if we sign with WRONG deviceFamily?
console.log('\n--- Mismatch Test: signing with deviceFamily="iPhone" but server has undefined ---');
const mismatchPayload = buildV3Payload({
  deviceId: identity.deviceId,
  clientId: connectParams.client.id,
  clientMode: connectParams.client.mode,
  role: 'operator',
  scopes: ['operator.read', 'operator.write'],
  signedAtMs,
  token: connectParams.auth.token,
  nonce: NONCE,
  platform: connectParams.client.platform,
  deviceFamily: 'iPhone', // MISMATCH: this won't be in connectParams
});
console.log(`  Signed payload: "${mismatchPayload}"`);
const mismatchSig = signPayload(identity.privateKeyPem, mismatchPayload);

// Server would verify against the CORRECT payload (with deviceFamily="" because connectParams lacks it)
const serverWouldVerify = verifySignature(identity.publicKeyRaw, payloadV3, mismatchSig);
console.log(`  Server-side verify (correct payload vs wrong sig): ${serverWouldVerify ? 'PASS ✓' : 'FAIL ✗ (expected!)'}`);

if (!verified) {
  console.log('\n!!! Local self-verification FAILED — there is a bug in our signing logic !!!');
  process.exit(1);
} else {
  console.log('\n=== All checks passed. The signing logic is correct. ===');
  console.log('If gateway still rejects, the issue is a payload mismatch between what we sign and what server rebuilds.');
  process.exit(0);
}
