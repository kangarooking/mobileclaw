/**
 * SecureStorage — Platform secure storage abstraction
 *
 * Wraps iOS Keychain / Android Keystore for sensitive credentials.
 * Phase 1: Uses AsyncStorage with obfuscation as placeholder.
 * TODO: Replace with native TurboModule (Keychain Services / EncryptedSharedPreferences).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@mobileclaw_secure_';
// Simple XOR obfuscation — NOT cryptographically secure.
// Replace with native Keychain/Keystore module for production.
function obfuscate(value: string): string {
  return btoa(encodeURIComponent(value));
}
function deobfuscate(encoded: string): string {
  try {
    return decodeURIComponent(atob(encoded));
  } catch {
    return '';
  }
}

export class SecureStorage {
  static async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(PREFIX + key, obfuscate(value));
  }

  static async getItem(key: string): Promise<string | null> {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return deobfuscate(raw);
  }

  static async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(PREFIX + key);
  }

  // Convenience methods for gateway tokens
  static async setGatewayToken(gatewayId: string, token: string): Promise<void> {
    return this.setItem(`gw_${gatewayId}_token`, token);
  }

  static async getGatewayToken(gatewayId: string): Promise<string | null> {
    return this.getItem(`gw_${gatewayId}_token`);
  }

  // ASR/TTS API keys
  static async setASRApiKey(key: string): Promise<void> {
    return this.setItem('asr_api_key', key);
  }

  static async getASRApiKey(): Promise<string | null> {
    return this.getItem('asr_api_key');
  }

  static async setTTSApiKey(key: string): Promise<void> {
    return this.setItem('tts_api_key', key);
  }

  static async getTTSApiKey(): Promise<string | null> {
    return this.getItem('tts_api_key');
  }
}
