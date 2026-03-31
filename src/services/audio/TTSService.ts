/**
 * TTSService — Pluggable text-to-speech with half-duplex mode
 *
 * Dual-path TTS:
 *   Path A (openclaw): Call openclaw's tts.convert RPC → play returned audio
 *   Path B (edge):    Microsoft Edge TTS (free, no API key)
 *   Path B (doubao):  Volcengine/豆包 TTS (requires API key)
 *
 * Half-duplex mode:
 *   When TTS is speaking → ASR pauses, isTTSSpeaking = true
 *   When TTS finishes  → ASR resumes, isTTSSpeaking = false
 */

import type { GatewayClient } from '../gateway/GatewayClient';
import { useSessionStore } from '@/store/useSessionStore';
import { EdgeTTSProvider } from './providers/EdgeTTSProvider';
import { DoubaoTTSProvider } from './providers/DoubaoTTSProvider';
import type { TTSProviderConfig } from '@/types/config';
import { getLogger } from '@/utils/logger';

const log = getLogger('TTSService');

export interface TTSEventHandlers {
  onStart?: () => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

export interface TTSProvider {
  initialize(config: TTSProviderConfig): Promise<void>;
  speak(text: string, handlers?: TTSEventHandlers): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * TTSService — Main entry point with half-duplex coordination.
 */
export class TTSService {
  private localProvider: TTSProvider | null = null;
  private gatewayClientRef: GatewayClient | null = null;
  private currentConfig: TTSProviderConfig | null = null;
  /** Currently speaking (for half-duplex guard) */
  private isSpeaking = false;

  bindGateway(client: GatewayClient): void {
    this.gatewayClientRef = client;
  }

  async initialize(config: TTSProviderConfig): Promise<void> {
    this.currentConfig = config;

    // Initialize local provider for non-openclaw paths
    switch (config.type) {
      case 'edge':
        this.localProvider = new EdgeTTSProvider();
        break;
      case 'doubao':
        this.localProvider = new DoubaoTTSProvider();
        break;
      case 'openclaw':
        // No local provider needed; uses gateway RPC
        this.localProvider = null;
        break;
      default:
        this.localProvider = null;
    }

    if (this.localProvider) {
      await this.localProvider.initialize(config);
    }

    log.info('TTSService initialized with path:', config.type);
  }

  /**
   * Speak text using the configured TTS path.
   * Automatically manages half-duplex mode (pauses ASR while speaking).
   */
  async speak(text: string, handlers?: TTSEventHandlers): Promise<void> {
    if (!text.trim()) return;
    if (!this.currentConfig) throw new Error('TTS not initialized. Call initialize() first.');
    if (this.isSpeaking) {
      log.warn('TTS already speaking, skipping');
      return;
    }

    this.isSpeaking = true;

    // ─── Half-duplex: Pause ASR while TTS speaks ────────────────
    const sessionStore = useSessionStore.getState();
    sessionStore.setIsTTSSpeaking(true);

    // Wrap handlers to ensure cleanup on both success and error
    const wrappedHandlers: TTSEventHandlers = {
      onStart: () => {
        log.info('TTS playback started:', text.slice(0, 40));
        handlers?.onStart?.();
      },
      onDone: () => {
        log.info('TTS playback finished');
        this.isSpeaking = false;
        sessionStore.setIsTTSSpeaking(false);
        handlers?.onDone?.();
      },
      onError: (error) => {
        log.error('TTS playback error:', error);
        this.isSpeaking = false;
        sessionStore.setIsTTSSpeaking(false);
        handlers?.onError?.(error);
      },
    };

    try {
      switch (this.currentConfig.type) {
        case 'openclaw':
          await this.speakViaOpenClaw(text, wrappedHandlers);
          break;

        case 'edge':
        case 'doubao':
          if (this.localProvider) {
            await this.localProvider.speak(text, wrappedHandlers);
          }
          break;

        default:
          throw new Error(`Unsupported TTS type: ${this.currentConfig.type}`);
      }
    } catch (error) {
      this.isSpeaking = false;
      sessionStore.setIsTTSSpeaking(false);
      throw error;
    }
  }

  /**
   * Stop current TTS playback immediately.
   */
  async stop(): Promise<void> {
    if (!this.isSpeaking) return;

    await this.localProvider?.stop();
    this.isSpeaking = false;
    useSessionStore.getState().setIsTTSSpeaking(false);
    log.info('TTS stopped by user/request');
  }

  /** Check if currently speaking */
  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  async destroy(): Promise<void> {
    await this.stop();
    await this.localProvider?.destroy();
    this.localProvider = null;
    this.gatewayClientRef = null;
  }

  // ─── Path A: OpenClaw tts.convert RPC ─────────────────────────────

  private async speakViaOpenClaw(text: string, handlers: TTSEventHandlers): Promise<void> {
    if (!this.gatewayClientRef) {
      throw new Error('Gateway not bound. Call bindGateway() before using openclaw TTS.');
    }

    handlers.onStart?.();

    try {
      const res = await this.gatewayClientRef.rpc<ArrayBuffer>('tts.convert', {
        text,
        outputFormat: 'mp3',
      });

      if (res) {
        // Play the audio data via expo-av
        const { Audio } = await import('expo-av');
        const base64 = this.arrayBufferToBase64(res as ArrayBuffer);
        const uri = `data:audio/mp3;base64,${base64}`;

        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
        );

        await new Promise<void>((resolve) => {
          sound.setOnPlaybackStatusUpdate?.((status) => {
            if (status.isLoaded && status.didJustFinish) {
              sound.unloadAsync().catch(() => {});
              resolve(undefined);
            }
          });
          setTimeout(() => resolve(), 30_000);
        });

        handlers.onDone?.();
      } else {
        handlers.onDone?.(); // Empty response, treat as done
      }

    } catch (error) {
      handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
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
}

export const ttsService = new TTSService();
