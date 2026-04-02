/**
 * RN-compatible utility functions
 *
 * React Native (JavaScriptCore on iOS) does NOT have:
 * - btoa() / atob()
 * - Buffer (Node.js)
 * - crypto.randomUUID() / crypto.getRandomValues() (in some versions)
 * - TextEncoder / TextDecoder (before RN 0.73)
 */

// ─── Base64 Encode/Decode (replaces btoa/atob) ─────────────────

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Uint8Array → base64 string */
export function uint8ToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result +=
      i + 1 < bytes.length
        ? BASE64_CHARS[((b1 & 15) << 2) | (b2 >> 6)]
        : '=';
    result += i + 2 < bytes.length ? BASE64_CHARS[b2 & 63] : '=';
  }
  return result;
}

/** base64 string → Uint8Array */
export function base64ToUint8(base64: string): Uint8Array {
  const cleaned = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = (cleaned.length * 3) >> 2;
  const bytes = new Uint8Array(len);
  let j = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const b0 = BASE64_CHARS.indexOf(cleaned[i]);
    const b1 = BASE64_CHARS.indexOf(cleaned[i + 1]);
    const b2 = BASE64_CHARS.indexOf(cleaned[i + 2] || 'A');
    const b3 = BASE64_CHARS.indexOf(cleaned[i + 3] || 'A');
    bytes[j++] = (b0 << 2) | (b1 >> 4);
    if (j < len) bytes[j++] = ((b1 & 15) << 4) | (b2 >> 2);
    if (j < len) bytes[j++] = ((b2 & 3) << 6) | b3;
  }
  return bytes;
}

/** string → Uint8Array (UTF-8 bytes) */
export function stringToUint8(str: string): Uint8Array {
  // Use unescape/encodeURIComponent trick for UTF-8 encoding
  const encoded = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p) =>
    String.fromCharCode(parseInt(p, 16)),
  );
  const arr = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) arr[i] = encoded.charCodeAt(i);
  return arr;
}

/** Uint8Array (UTF-8) → string */
export function uint8ToString(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return decodeURIComponent(escape(str));
}

// ─── Secure Random ────────────────────────────────────────────────

/** Generate a random UUID v4 (RN-safe, no crypto dependency) */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    try {
      if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return formatUUID(bytes);
    } catch {
      // fall through to Math.random fallback
    }
  }
  // Fallback: Math.random-based (not cryptographically secure but functional)
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return formatUUID(bytes);
}

function formatUUID(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return (
    hex.slice(0, 8) +
    '-' +
    hex.slice(8, 12) +
    '-' +
    '4' +
    hex.slice(13, 16) +
    '-' +
    ((parseInt(hex[16], 16) & 0x3f) | 0x80).toString(16) +
    hex.slice(17, 20) +
    '-' +
    hex.slice(20, 32)
  );
}
