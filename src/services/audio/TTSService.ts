/**
 * TTSService — Pluggable text-to-speech abstraction
 *
 * Dual-path TTS:
 *   Path A: Call openclaw's tts.convert RPC method
 *   Path B: Local TTS synthesis (Edge TTS / Doubao TTS)
 */

import type { TTSProviderConfig } from '@/types/config';
import type { GatewayClient } from '@/types/protocol';
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
 * Edge TTS Provider (free, reliable fallback)
 *
 * Uses Microsoft Edge's online TTS API.
 */
export class EdgeTTSProvider implements TTSProvider {
  private config: TTSProviderConfig | null = null;

  async initialize(config: TTSProviderConfig): Promise<void> {
    this.config = config;
    log.info('EdgeTTS initialized, voice:', config.voiceId);
    // TODO: Implement Edge TTS
    // Edge TTS uses a REST API to synthesize speech, returns audio data
  }

  async speak(text: string, handlers?: TTSEventHandlers): Promise<void> {
    log.info('EdgeTTS speaking:', text.slice(0, 50));
    handlers?.onStart?.();
    // TODO: Call Edge TTS API, stream audio to speaker
    handlers?.onDone?.();
  }

  async stop(): Promise<void> {
    log.info('EdgeTTS stopped');
  }

  async destroy(): Promise<void> {}
}

/**
 * Doubao TTS Provider
 */
export class DoubaoTTSProvider implements TTSProvider {
  private config: TTSProviderConfig | null = null;

  async initialize(config: TTSProviderConfig): Promise<void> {
    this.config = config;
    log.info('DoubaoTTS initialized');
    // TODO: Implement Doubao TTS API integration
  }

  async speak(text: string, handlers?: TTSEventHandlers): Promise<void> {
    log.info('DoubaoTTS speaking:', text.slice(0, 50));
    handlers?.onStart?.();
    // TODO: Call Doubao TTS API
    handlers?.onDone?.();
  }

  async stop(): Promise<void> {}

  async destroy(): Promise<void> {}
}

/**
 * TTSService — Main entry point
 */
export class TTSService {
  private localProvider: TTSProvider | null = null;
  private gatewayClient: GatewayClient | null = null;
  private currentConfig: TTSProviderConfig | null = null;

  bindGateway(client: GatewayClient): void {
    this.gatewayClient = client;
  }

  async initialize(config: TTSProviderConfig): Promise<void> {
    this.currentConfig = config;

    // Initialize local provider (for non-openclaw path)
    switch (config.type) {
      case 'edge':
        this.localProvider = new EdgeTTSProvider();
        break;
      case 'doubao':
        this.localProvider = new DoubaoTTSProvider();
        break;
      default:
        this.localProvider = null;
    }

    if (this.localProvider) {
      await this.localProvider.initialize(config);
    }
  }

  /**
   * Speak text using the appropriate path based on config.type
   */
  async speak(text: string, handlers?: TTSEventHandlers): Promise<void> {
    if (!this.currentConfig) throw new Error('TTS not initialized');

    switch (this.currentConfig.type) {
      case 'openclaw': {
        // Path A: Use openclaw's built-in tts.convert
        if (!this.gatewayClient) {
          throw new Error('Gateway not bound for openclaw TTS');
        }
        try {
          handlers?.onStart?.();
          const res = await this.gatewayClient.rpc<ArrayBuffer>('tts.convert', {
            text,
            outputFormat: 'pcm_44100',
          });
          log.info('tts.convert response received, playing audio...');
          // TODO: Play the returned audio buffer through speaker
          handlers?.onDone?.();
        } catch (e) {
          log.error('openclaw tts.convert failed:', e);
          handlers?.onError?.(e instanceof Error ? e : new Error(String(e)));
        }
        break;
      }

      case 'edge':
      case 'doubao': {
        // Path B: Use local TTS provider
        if (this.localProvider) {
          await this.localProvider.speak(text, handlers);
        }
        break;
      }

      default:
        throw new Error(`Unsupported TTS type: ${this.currentConfig.type}`);
    }
  }

  async stop(): Promise<void> {
    await this.localProvider?.stop();
  }

  async destroy(): Promise<void> {
    await this.localProvider?.destroy();
    this.localProvider = null;
    this.gatewayClient = null;
  }
}

export const ttsService = new TTSService();
