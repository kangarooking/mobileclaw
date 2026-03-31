/**
 * DoubaoTTSProvider — 火山引擎/豆包 TTS 合成
 *
 * Uses Volcengine (火山引擎) TTS REST API for speech synthesis.
 * Requires API key configured in Settings.
 *
 * Reference: https://www.volcengine.com/docs/6561/79814
 */

import { Audio } from 'expo-av';
import type { TTSProvider, TTSEventHandlers } from '../TTSService';
import type { TTSProviderConfig } from '@/types/config';
import { getLogger } from '@/utils/logger';

const log = getLogger('DoubaoTTS');

/** Default Volcengine TTS endpoint */
const DEFAULT_ENDPOINT = 'https://openspeech.bytedance.com/api/v1/tts';

export class DoubaoTTSProvider implements TTSProvider {
  private config: TTSProviderConfig | null = null;
  private sound: Audio.Sound | null = null;

  async initialize(config: TTSProviderConfig): Promise<void> {
    this.config = config;
    log.info('DoubaoTTS initialized:', {
      endpoint: config.endpoint || DEFAULT_ENDPOINT,
      voiceId: config.voiceId,
      language: config.language,
      speed: config.speed ?? 1.0,
    });
  }

  /**
   * Synthesize speech via Doubao TTS API and play it.
   */
  async speak(text: string, handlers?: TTSEventHandlers): Promise<void> {
    if (!text.trim()) return;
    const hasCredentials = this.config?.appId && this.config?.accessToken;
    if (!hasCredentials && !this.config?.apiKey) {
      handlers?.onError?.(new Error('Doubao TTS credentials not configured (need App ID + Access Token)'));
      return;
    }

    log.info('DoubaoTTS speaking:', text.slice(0, 60));
    handlers?.onStart?.();

    try {
      const audioData = await this.synthesize(text);
      if (!audioData) {
        throw new Error('No audio data received from Doubao TTS');
      }

      await this.playAudio(audioData);
      handlers?.onDone?.();

    } catch (error) {
      log.error('DoubaoTTS speak failed:', error);
      handlers?.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async stop(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
      } catch {
        // Ignore cleanup errors
      }
      this.sound = null;
    }
    log.info('DoubaoTTS stopped');
  }

  async destroy(): Promise<void> {
    await this.stop();
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private async synthesize(text: string): Promise<ArrayBuffer | null> {
    const endpoint = this.config?.endpoint || DEFAULT_ENDPOINT;
    // Use dedicated Doubao credentials, fallback to generic apiKey
    const appId = this.config?.appId || this.config?.apiKey || '';
    const token = this.config?.accessToken || this.config?.options?.['token' as string] || this.config?.apiKey || '';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          app: {
            appid: appId,
            token: token,
            cluster: 'volcengine_streaming_common',
          },
          user: {
            uid: 'mobileclaw-ios',
          },
          audio: {
            voice_type: this.config?.voiceId || 'zh_female_wanwan_moon_bigtts',
            language: this.config?.language || 'zh-CN',
            speed: this.config?.speed ?? 1.0,
            encoding: 'mp3',
            volume_ratio: 1.0,
            pitch_ratio: 1.0,
          },
          request: {
            reqid: `tts-${Date.now()}`,
            text,
            operation: 'query',
            text_type: 'plain',
            with_frontend: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Doubao TTS error: ${response.status} ${response.statusText}`);
      }

      // Response may be JSON (with audio URL) or binary audio data
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('json')) {
        // JSON response — extract audio URL or base64 data
        const json = await response.json();
        if (json.data) {
          // Base64-encoded audio in response
          if (typeof json.data === 'string') {
            return this.base64ToArrayBuffer(json.data);
          }
          // URL to audio file
          if (typeof json.data === 'string' && json.data.startsWith('http')) {
            const audioResp = await fetch(json.data);
            return audioResp.arrayBuffer();
          }
        }
        log.warn('Unexpected TTS JSON response:', JSON.stringify(json).slice(0, 200));
        return null;
      }

      // Binary audio response
      return response.arrayBuffer();

    } catch (error) {
      log.error('Doubao TTS synthesis failed:', error);
      return null;
    }
  }

  private async playAudio(audioData: ArrayBuffer): Promise<void> {
    await this.stop();

    const base64 = this.arrayBufferToBase64(audioData);
    const uri = `data:audio/mp3;base64,${base64}`;

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
      );

      this.sound = sound;

      return new Promise((resolve) => {
        sound.setOnPlaybackStatusUpdate?.((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            this.sound = null;
            resolve(undefined);
          }
        });

        setTimeout(() => {
          this.stop().then(resolve).catch(() => resolve());
        }, 30_000);
      });

    } catch (error) {
      log.error('Audio playback failed:', error);
      throw error;
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  }
}
