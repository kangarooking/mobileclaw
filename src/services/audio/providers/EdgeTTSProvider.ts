/**
 * EdgeTTSProvider — Microsoft Edge TTS (free, no API key required)
 *
 * Uses Microsoft's Edge Text-to-Speech service via REST API.
 * Supports 300+ voices across 40+ languages.
 *
 * Reference: https://github.com/rany2/edge-tts (Python reference impl)
 *
 * Protocol:
 *   POST to speech synthesis endpoint with SSML body
 *   Returns audio data (MP3 or PCM)
 */

import { Audio } from 'expo-av';
import type { TTSProvider, TTSEventHandlers } from '../TTSService';
import type { TTSProviderConfig } from '@/types/config';
import { getLogger } from '@/utils/logger';

const log = getLogger('EdgeTTS');

// ─── Constants ──────────────────────────────────────────────────────

/** Microsoft Edge TTS synthesis endpoint */
const SYNTHESIS_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/connections/v1';

/** Default Chinese voice (female, neutral) */
const DEFAULT_VOICE_ZH = 'zh-CN-XiaoxiaoNeural';
const DEFAULT_VOICE_EN = 'en-US-JennyNeural';

/** Voice map for common language codes */
const VOICE_MAP: Record<string, string> = {
  'zh-CN': DEFAULT_VOICE_ZH,
  'zh-TW': 'zh-TW-HsiaoChenNeural',
  'en-US': DEFAULT_VOICE_EN,
  'en-GB': 'en-GB-SoniaNeural',
  'ja-JP': 'ja-JP-NanamiNeural',
  'ko-KR': 'ko-KR-SunHiNeural',
};

// ─── Provider ───────────────────────────────────────────────────────

export class EdgeTTSProvider implements TTSProvider {
  private config: TTSProviderConfig | null = null;
  private sound: Audio.Sound | null = null;
  private currentPlayback: { status: 'idle' | 'playing' | 'loading' } = { status: 'idle' };

  async initialize(config: TTSProviderConfig): Promise<void> {
    this.config = config;
    log.info('EdgeTTS initialized:', {
      voice: config.voiceId || VOICE_MAP[config.language] || DEFAULT_VOICE_ZH,
      language: config.language,
      speed: config.speed ?? 1.0,
    });
  }

  /**
   * Synthesize speech and play it through device speaker.
   *
   * Flow: Build SSML → POST to Edge TTS → Receive MP3 audio → Play via expo-av
   */
  async speak(text: string, handlers?: TTSEventHandlers): Promise<void> {
    if (!text.trim()) return;

    const voice = this.config?.voiceId || VOICE_MAP[this.config?.language || ''] || DEFAULT_VOICE_ZH;
    const rate = (this.config?.speed ?? 1.0).toString();
    const ssml = this.buildSSML(text, voice, rate);

    log.info('EdgeTTS speaking:', text.slice(0, 60), '[voice:', voice, ']');
    handlers?.onStart?.();

    try {
      // Synthesize audio via Edge TTS REST API
      const audioData = await this.synthesize(ssml);
      if (!audioData) {
        throw new Error('No audio data received from Edge TTS');
      }

      // Play the audio
      await this.playAudio(audioData);
      handlers?.onDone?.();

    } catch (error) {
      log.error('EdgeTTS speak failed:', error);
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
    this.currentPlayback = { status: 'idle' };
    log.info('EdgeTTS stopped');
  }

  async destroy(): Promise<void> {
    await this.stop();
  }

  // ─── Internal: SSML & Synthesis ───────────────────────────────────

  /**
   * Build SSML (Speech Synthesis Markup Language) for Edge TTS.
   */
  private buildSSML(text: string, voice: string, rate: string): string {
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3icrosoft.com/mstts" xml:lang="${this.config?.language || 'zh-CN'}">
  <voice name="${voice}">
    <prosody rate="${rate}">${this.escapeXml(text)}</prosody>
  </voice>
</speak>`;
  }

  /** Escape special XML characters in text */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Call Edge TTS synthesis API and return audio data as ArrayBuffer.
   */
  private async synthesize(ssml: string): Promise<ArrayBuffer | null> {
    try {
      const response = await fetch(SYNTHESIS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'MobileClaw/1.0',
        },
        body: ssml,
      });

      if (!response.ok) {
        throw new Error(`Edge TTS API error: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      log.debug(`Synthesized ${arrayBuffer.byteLength} bytes of audio`);
      return arrayBuffer;

    } catch (error) {
      log.error('Edge TTS synthesis failed:', error);
      return null;
    }
  }

  /**
   * Play audio data through device speaker using expo-av.
   */
  private async playAudio(audioData: ArrayBuffer): Promise<void> {
    // Stop any existing playback
    await this.stop();

    // Create temp file URI from ArrayBuffer
    // expo-av Sound requires a URI, so we write to a temp location
    const base64 = this.arrayBufferToBase64(audioData);
    const uri = `data:audio/mp3;base64,${base64}`;

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, progressUpdateIntervalMillis: 100 },
      );

      this.sound = sound;
      this.currentPlayback = { status: 'playing' };

      // Wait for playback to complete
      return new Promise((resolve) => {
        sound.setOnPlaybackStatusUpdate?.((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            this.sound = null;
            this.currentPlayback = { status: 'idle' };
            resolve(undefined);
          }
        });

        // Fallback timeout (30s max per utterance)
        setTimeout(() => {
          if (this.currentPlayback.status === 'playing') {
            this.stop().then(resolve).catch(() => resolve());
          } else {
            resolve(undefined);
          }
        }, 30_000);
      });

    } catch (error) {
      log.error('Audio playback failed:', error);
      this.currentPlayback = { status: 'idle' };
      throw error;
    }
  }

  /** Convert ArrayBuffer to base64 string */
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
}
