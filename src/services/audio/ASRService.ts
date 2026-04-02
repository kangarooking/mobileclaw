/**
 * ASRService — Pluggable speech recognition abstraction
 *
 * Manages ASR provider lifecycle and provides a unified interface
 * for streaming speech recognition. The active provider handles
 * connection management, audio streaming, and result dispatching.
 */

import type { ASRProviderConfig } from '@/types/config';
import { DoubaoASRProvider } from './providers/DoubaoASRProvider';
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
  prepareNextTurn?(): Promise<void>;
  /** Feed PCM audio data (for providers that accept external audio input) */
  feedPCM?(data: ArrayBuffer | Uint8Array): void;
}

/**
 * ASRService — Main entry point that delegates to the active provider.
 *
 * Usage:
 *   await asrService.initialize(config);
 *   await asrService.startListening({ onInterim, onFinal, onError });
 *   // ... feed PCM data via asrService.feedPCM(pcmData) ...
 *   await asrService.stopListening();
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
    log.info('ASR service initialized with provider:', config.type);
  }

  async startListening(handlers: ASREventHandlers): Promise<void> {
    if (!this.provider) throw new Error('ASR not initialized. Call initialize() first.');
    if (this.isListening) {
      log.warn('ASR already listening, ignoring startListening()');
      return;
    }
    this.isListening = true;
    await this.provider.startListening(handlers);
    log.info('ASR started listening');
  }

  /**
   * Feed raw PCM audio data to the active ASR provider.
   * No-op if no provider or provider doesn't support feedPCM.
   *
   * @param pcmData Raw PCM Int16 audio (16kHz/mono/16bit)
   */
  feedPCM(pcmData: ArrayBuffer | Uint8Array): void {
    this.provider?.feedPCM?.(pcmData);
  }

  async stopListening(): Promise<void> {
    if (!this.provider || !this.isListening) return;
    this.isListening = false;
    await this.provider.stopListening();
    log.info('ASR stopped listening');
  }

  async prepareNextTurn(): Promise<void> {
    if (!this.provider || !this.isListening || !this.provider.prepareNextTurn) return;
    await this.provider.prepareNextTurn();
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
