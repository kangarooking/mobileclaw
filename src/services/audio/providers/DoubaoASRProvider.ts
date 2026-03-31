/**
 * DoubaoASRProvider — 豆包/火山引擎流式语音识别
 *
 * WebSocket-based streaming ASR using Volcengine (火山引擎) Speech Recognition API.
 *
 * Protocol flow:
 *   1. Connect to wss://openspeech.bytedance.com/api/v1/asr
 *   2. Send JSON config frame (appid, token, audio format)
 *   3. Stream binary PCM audio frames (16kHz/mono/16bit)
 *   4. Receive JSON result frames (interim + final transcripts)
 *   5. Send finish signal → receive final response → close
 *
 * Reference: https://www.volcengine.com/docs/6561/80823
 */

import type { ASRProvider, ASREventHandlers } from '../ASRService';
import type { ASRProviderConfig } from '@/types/config';
import { getLogger } from '@/utils/logger';
import { AUDIO_SAMPLE_RATE } from '@/utils/constants';

const log = getLogger('DoubaoASR');

// ─── Protocol Constants ─────────────────────────────────────────────

/** Default Volcengine ASR endpoint */
const DEFAULT_ENDPOINT = 'wss://openspeech.bytedance.com/api/v1/asr';

/** Payload types sent to server */
const PAYLOAD_TYPE = {
  CONFIG: 'full_client_config',     // Initial configuration
  AUDIO: 'audio_data',              // Binary PCM chunk
  FINISH: 'audio_finish',           // End of speech signal
} as const;

/** Result types received from server */
const RESULT_TYPE = {
  INTERIM: 'partial_result',        // Interim/partial transcript
  FINAL: 'final_result',            // Final confirmed transcript
  ERROR: 'error',
  FINISHED: 'speech_finished',
} as const;

// ─── Types ──────────────────────────────────────────────────────────

interface DoubaoConfigPayload {
  app: {
    appid: string;
    token: string;
    cluster?: string;
  };
  user: {
    uid: string;
  };
  audio: {
    format: string;
    rate: number;
    channel: number;
    bits: number;
    language: string;
  };
  request: {
    reqid: string;
    nbest: number;
    result_type: 'full' | 'partial';
  };
}

interface DoubaoResultPayload {
  type: string;
  seq: number;
  result?: {
    text: string;
    confidence: number;
    is_final?: boolean;
  };
  error_code?: number;
  error_message?: string;
}

// ─── Provider Implementation ─────────────────────────────────────────

export class DoubaoASRProvider implements ASRProvider {
  private ws: WebSocket | null = null;
  private config: ASRProviderConfig | null = null;
  private handlers: ASREventHandlers | null = null;
  private seq = 0;
  private connected = false;
  private finished = false;

  /** Accumulated final text (server sends incremental finals) */
  private accumulatedText = '';

  async initialize(config: ASRProviderConfig): Promise<void> {
    this.config = config;
    log.info('DoubaoASR initialized:', {
      endpoint: config.endpoint || DEFAULT_ENDPOINT,
      language: config.language,
      model: config.model,
    });
  }

  /**
   * Start listening — opens WS connection, sends config, begins receiving results.
   * Call feedPCM() repeatedly to stream audio data.
   */
  async startListening(handlers: ASREventHandlers): Promise<void> {
    if (!this.config?.apiKey) {
      handlers.onError(new Error('Doubao ASR API key not configured. Set it in Settings.'));
      return;
    }

    this.handlers = handlers;
    this.seq = 0;
    this.accumulatedText = '';
    this.finished = false;

    const endpoint = this.config.endpoint || DEFAULT_ENDPOINT;
    log.info('Connecting to Doubao ASR:', endpoint);

    try {
      await this.connect(endpoint);
      this.sendConfig();
      log.info('Doubao ASR connected and configured, ready for audio');
    } catch (error) {
      log.error('Doubao ASR connection failed:', error);
      handlers.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Feed PCM audio data to the ASR engine.
   * Call this repeatedly with small chunks (~20ms = 640 bytes at 16kHz/16bit/mono).
   *
   * @param pcmData Raw PCM Int16 audio data (ArrayBuffer or Uint8Array)
   */
  feedPCM(pcmData: ArrayBuffer | Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.finished) return;

    // Wrap binary data as a frame with sequence number
    const header = new TextEncoder().encode(
      JSON.stringify({ type: PAYLOAD_TYPE.AUDIO, seq: ++this.seq }),
    );
    const newline = new TextEncoder().encode('\n');

    const payload = new Uint8Array(header.length + pcmData.byteLength + newline.length);
    payload.set(header, 0);
    payload.set(new Uint8Array(pcmData), header.length);
    payload.set(newline, header.length + pcmData.byteLength);

    this.ws.send(payload);
  }

  /**
   * Stop listening — send finish signal, wait for final result, close connection.
   */
  async stopListening(): Promise<void> {
    if (!this.ws) return;

    this.finished = true;
    log.info('Sending audio_finish signal');

    try {
      // Send finish signal
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: PAYLOAD_TYPE.FINISH,
          seq: ++this.seq,
        }));
        // Wait briefly for server to send final result
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch {
      // Ignore errors during cleanup
    }

    this.close();
    log.info('Doubao ASR stopped');
  }

  async destroy(): Promise<void> {
    await this.stopListening();
  }

  // ─── Internal: Connection & Protocol ──────────────────────────────

  private async connect(endpoint: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(endpoint);

      this.ws.onopen = () => {
        this.connected = true;
        log.info('WebSocket connected to ASR endpoint');
        resolve(undefined);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (event) => {
        log.error('WebSocket error:', event);
        reject(new Error('Doubao ASR WebSocket connection error'));
      };

      this.ws.onclose = (event) => {
        this.connected = false;
        log.info('WebSocket closed:', event.code, event.reason);
      };
    });
  }

  private sendConfig(): void {
    if (!this.ws || !this.config) return;

    const payload: DoubaoConfigPayload = {
      app: {
        appid: this.config.apiKey || '',
        token: this.config.options?.['token'] as string || this.config.apiKey || '',
        cluster: (this.config.options?.['cluster'] as string) || 'volcengine_streaming_common',
      },
      user: {
        uid: 'mobileclaw-ios',
      },
      audio: {
        format: 'pcm',
        rate: AUDIO_SAMPLE_RATE,
        channel: 1,
        bits: 16,
        language: this.config.language || 'zh-CN',
      },
      request: {
        reqid: `mc-${Date.now()}`,
        nbest: 1,
        result_type: 'full',       // Request both partial + final results
      },
    };

    log.debug('Sending ASR config:', { ...payload, app: { ...payload.app, token: '***' } });

    this.ws.send(JSON.stringify({
      type: PAYLOAD_TYPE.CONFIG,
      ...payload,
    }));
  }

  private handleMessage(data: string | ArrayBuffer): void {
    if (typeof data !== 'string') return; // Binary responses not expected in v1

    let parsed: DoubaoResultPayload;
    try {
      parsed = JSON.parse(data);
    } catch {
      log.warn('Failed to parse ASR response:', String(data).slice(0, 200));
      return;
    }

    switch (parsed.type) {
      case RESULT_TYPE.INTERIM:
      case 'partial_result':
        this.handleInterim(parsed);
        break;

      case RESULT_TYPE.FINAL:
      case 'final_result':
        this.handleFinal(parsed);
        break;

      case RESULT_TYPE.ERROR:
      case 'error':
        this.handleError(parsed);
        break;

      case RESULT_TYPE.FINISHED:
      case 'speech_finished':
        log.info('Server confirmed speech finished');
        break;

      default:
        log.debug('Unknown ASR message type:', parsed.type, parsed);
    }
  }

  private handleInterim(result: DoubaoResultPayload): void {
    const text = result.result?.text || '';
    const confidence = result.result?.confidence;
    log.debug('Interim:', text.slice(0, 50));
    this.handlers?.onInterim(text, confidence);
  }

  private handleFinal(result: DoubaoResultPayload): void {
    const text = result.result?.text || '';
    const confidence = result.result?.confidence;

    if (text) {
      // Accumulate: server may send incremental finals
      // Only fire onFinal for new text (not already in accumulation)
      const prevLen = this.accumulatedText.length;
      this.accumulatedText = text; // Full text so far

      // If this adds new content beyond what we've seen
      if (text.length > prevLen) {
        const newText = text.slice(prevLen);
        log.info('Final:', newText);
        this.handlers?.onFinal(newText, confidence);
      }
    }
  }

  private handleError(result: DoubaoResultPayload): void {
    const msg = result.error_message || `ASR error code ${result.error_code}`;
    log.error('Doubao ASR error:', msg);
    this.handlers?.onError(new Error(msg));
  }

  private close(): void {
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client stop');
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
    this.connected = false;
    this.finished = false;
  }
}
