import nacl from 'tweetnacl';
import { sha256 } from 'js-sha256';

import { SecureStorage } from '@/services/storage/SecureStorage';
import { base64ToUint8, uint8ToBase64 } from '@/utils/rnCompat';
import type { DeviceIdentity } from './GatewayClient';

function toBase64Url(bytes: Uint8Array): string {
  return uint8ToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return base64ToUint8(padded);
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export class DeviceIdentityService {
  static async getOrCreateIdentity(): Promise<DeviceIdentity> {
    const [deviceId, publicKeyB64Url, privateKeySeedB64Url] = await Promise.all([
      SecureStorage.getDeviceId(),
      SecureStorage.getDevicePublicKey(),
      SecureStorage.getDevicePrivateKey(),
    ]);

    if (deviceId && publicKeyB64Url && privateKeySeedB64Url) {
      return { deviceId, publicKeyB64Url, privateKeySeedB64Url };
    }

    const seed = randomBytes(32);
    const keyPair = nacl.sign.keyPair.fromSeed(seed);
    const nextIdentity: DeviceIdentity = {
      deviceId: sha256(keyPair.publicKey),
      publicKeyB64Url: toBase64Url(keyPair.publicKey),
      privateKeySeedB64Url: toBase64Url(seed),
    };

    await Promise.all([
      SecureStorage.setDeviceId(nextIdentity.deviceId),
      SecureStorage.setDevicePublicKey(nextIdentity.publicKeyB64Url),
      SecureStorage.setDevicePrivateKey(nextIdentity.privateKeySeedB64Url),
    ]);

    return nextIdentity;
  }

  static getSecretKey(identity: DeviceIdentity): Uint8Array {
    const seed = fromBase64Url(identity.privateKeySeedB64Url);
    return nacl.sign.keyPair.fromSeed(seed).secretKey;
  }

  static toBase64Url(bytes: Uint8Array): string {
    return toBase64Url(bytes);
  }
}
