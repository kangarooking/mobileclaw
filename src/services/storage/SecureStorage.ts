/**
 * SecureStorage — Platform secure storage abstraction
 *
 * Wraps iOS Keychain / Android EncryptedSharedPreferences for sensitive credentials.
 *
 * Uses expo-secure-store which provides:
 *   iOS:     Keychain Services (kSecClassGenericPassword, kSecAttrAccessibleWhenUnlocked)
 *   Android: EncryptedSharedPreferences (AES256-GCM with generated master key)
 *
 * All data is encrypted at rest and requires device unlock to access.
 */

import * as SecureStore from 'expo-secure-store';

/** Service name used as the Keychain account / Android pref key prefix */
const SERVICE = 'com.mobileclaw.keystore';

/**
 * SecureStorage — Static utility class for secure key-value storage.
 *
 * Keys are namespaced under the MobileClaw service to avoid collisions.
 */
export class SecureStorage {
  /**
   * Store a value securely.
   * @param key Key name (will be prefixed with service name)
   * @param value Plain text value to encrypt and store
   */
  static async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(this.namespacedKey(key), value);
  }

  /**
   * Retrieve a stored value.
   * @param key Key name
   * @returns Decrypted value, or null if not found
   */
  static async getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(this.namespacedKey(key));
  }

  /**
   * Remove a stored value.
   */
  static async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(this.namespacedKey(key));
  }

  /**
   * Check if a key exists in secure storage.
   */
  static async hasItem(key: string): Promise<boolean> {
    const val = await this.getItem(key);
    return val !== null;
  }

  // ─── Gateway Token Methods ──────────────────────────────────────

  /** Store gateway auth token securely */
  static async setGatewayToken(gatewayId: string, token: string): Promise<void> {
    return this.setItem(`gw_${gatewayId}_token`, token);
  }

  /** Retrieve gateway auth token */
  static async getGatewayToken(gatewayId: string): Promise<string | null> {
    return this.getItem(`gw_${gatewayId}_token`);
  }

  // ─── Doubao ASR Credentials ──────────────────────────────────────

  /** Store Volcengine App ID */
  static async setASRAppId(appId: string): Promise<void> {
    return this.setItem('asr_app_id', appId);
  }

  /** Retrieve Volcengine App ID */
  static async getASRAppId(): Promise<string | null> {
    return this.getItem('asr_app_id');
  }

  /** Store Volcengine Access Token */
  static async setASRAccessToken(token: string): Promise<void> {
    return this.setItem('asr_access_token', token);
  }

  /** Retrieve Volcengine Access Token */
  static async getASRAccessToken(): Promise<string | null> {
    return this.getItem('asr_access_token');
  }

  // ─── TTS API Key Methods ────────────────────────────────────────────

  static async setTTSApiKey(key: string): Promise<void> {
    return this.setItem('tts_api_key', key);
  }

  static async getTTSApiKey(): Promise<string | null> {
    return this.getItem('tts_api_key');
  }

  // ─── Device Identity (Ed25519 Keypair) ─────────────────────────

  /** Store Ed25519 private key PEM (HIGHLY SENSITIVE) */
  static async setDevicePrivateKey(pem: string): Promise<void> {
    return this.setItem('device_private_key', pem);
  }

  /** Retrieve Ed25519 private key PEM */
  static async getDevicePrivateKey(): Promise<string | null> {
    return this.getItem('device_private_key');
  }

  /** Store Ed25519 public key (base64url-encoded) */
  static async setDevicePublicKey(b64Url: string): Promise<void> {
    return this.setItem('device_public_key', b64Url);
  }

  /** Retrieve Ed25519 public key */
  static async getDevicePublicKey(): Promise<string | null> {
    return this.getItem('device_public_key');
  }

  /** Store device ID (SHA-256 fingerprint of public key) */
  static async setDeviceId(deviceId: string): Promise<void> {
    return this.setItem('device_id', deviceId);
  }

  /** Retrieve device ID */
  static async getDeviceId(): Promise<string | null> {
    return this.getItem('device_id');
  }

  // ─── Internal ───────────────────────────────────────────────────

  /**
   * Namespace keys to avoid collisions with other apps/services.
   * Format: "service:key"
   */
  private static namespacedKey(key: string): string {
    return `${SERVICE}:${key}`;
  }
}
