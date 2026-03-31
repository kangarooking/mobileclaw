/**
 * ASRService — Pluggable speech recognition abstraction
 */

import type { ASRProviderConfig } from '@/types/config';
import { getLogger } from '@/utils/logger';

const log = getLogger('ASRService');

export interface ASREventHandlers {
  onInterim: (text: string, confidence?: number) => void;
  onFinal: (text: string, confidence?: number) => void;
  onError: (error: Error) => void;
}

export interface ASRProvider {
  initialize(config: ASRProviderConfig): Promise<void>;
  startListening(handlers: ASREventHandlers): Promise<void>;
  stopListening(): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * Doubao ASR Provider (Phase 1 primary)
 *
 * Connects to Doubao's streaming ASR WebSocket API.
 * Sends PCM audio chunks, receives interim + final transcripts.
 */
export class DoubaoASRProvider implements ASRProvider {
  private ws: WebSocket | null = null;
  private config: ASRProviderConfig | null = null;

  async initialize(config: ASRProviderConfig): Promise<void> {
    this.config = config;
    log.info('DoubaoASR initialized with endpoint:', config.endpoint);
    // TODO: Implement actual Doubao WS connection
    // Doubao streaming ASR typically:
    // 1. Connect to wss://openspeech.bytedance.com/api/v1/asr
    // 2. Send config JSON with appid, token, language, codec
    // 3. Stream PCM binary frames
    // 4. Receive JSON responses with result type (interim/final)
  }

  async startListening(handlers: ASREventHandlers): Promise<void> {
    if (!this.config?.endpoint) {
      handlers.onError(new Error('Doubao ASR endpoint not configured'));
      return;
    }
    log.info('DoubaoASR starting listening...');
    // TODO: Open WS connection and start streaming audio
    // For now, simulate with a stub for development
  }

  async stopListening(): Promise<void> {
    log.info('DoubaoASR stopping listening...');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async destroy(): Promise<void> {
    await this.stopListening();
  }
}

/**
 * ASRService — Main entry point that delegates to the active provider
 */
export class ASRService {
  private provider: ASRProvider | null = null;
  private isListening = false;

  async initialize(config: ASRProviderConfig): Promise<void> {
    switch (config.type) {
      case 'doubao':
        this.provider = new DoubaoASRProvider();
        break;
      default:
        throw new Error(`Unsupported ASR type: ${config.type}`);
    }
    await this.provider.initialize(config);
  }

  async startListening(handlers: ASREventHandlers): Promise<void> {
    if (!this.provider) throw new Error('ASR not initialized');
    if (this.isListening) return;
    this.isListening = true;
    await this.provider.startListening(handlers);
  }

  async stopListening(): Promise<void> {
    if (!this.provider || !this.isListening) return;
    this.isListening = false;
    await this.provider.stopListening();
  }

  getIsListening(): boolean {
    return this.isListening;
  }

  async destroy(): Promise<void> {
    await this.provider?.destroy();
    this.provider = null;
    this.isListening = false;
  }
}

export const asrService = new ASRService();
