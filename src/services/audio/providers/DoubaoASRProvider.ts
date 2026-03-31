/**
 * DoubaoASRProvider — 豆包/火山引擎流式语音识别
 *
 * 基于 Volcengine Speech Recognition WebSocket API (v1)。
 * 协议参考: https://www.volcengine.com/docs/6561/80823
 * SDK 参考: @xmov/doubao-asr（提取了协议帧格式和事件模型）
 *
 * 认证方式:
 *   - AppId + Access Token（火山引擎控制台获取）
 *   - 发送在 full_client_config 帧的 app 字段中
 *
 * 音频输入:
 *   - 外部 PCM 数据通过 feedPCM() 注入（来自 AudioManager/AudioCaptureBridge）
 *   - 格式: 16kHz / mono / 16bit PCM
 *
 * 协议流程:
 *   1. WS connect → wss://openspeech.bytedance.com/api/v1/asr
 *   2. Send full_client_config (JSON, 含 appid+token)
 *   3. Stream audio_data (binary PCM)
 *   4. Receive partial_result / final_result / speech_finished
 *   5. Send audio_finish → close
 */

import type { ASRProvider, ASREventHandlers } from '../ASRService';
import type { ASRProviderConfig } from '@/types/config';
import { getLogger } from '@/utils/logger';
import { AUDIO_SAMPLE_RATE } from '@/utils/constants';
import { v4 as uuid } from 'uuid';

const log = getLogger('DoubaoASR');

// ─── Protocol Constants ─────────────────────────────────────────────

/** Volcengine ASR v1 endpoint */
const DEFAULT_ENDPOINT = 'wss://openspeech.bytedance.com/api/v1/asr';

/** Payload types sent to server */
const PAYLOAD_TYPE = {
  CONFIG: 'full_client_config',
  AUDIO: 'audio_data',
  FINISH: 'audio_finish',
} as const;

/** Result types received from server */
const RESULT_TYPE = {
  INTERIM: 'partial_result',
  FINAL: 'final_result',
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

  /** Accumulated final text for this utterance */
  private currentUtterance = '';

  /** All completed utterances (for full transcript) */
  private completedUtterances: string[] = [];

  /** Reconnection state */
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Heartbeat timer */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  async initialize(config: ASRProviderConfig): Promise<void> {
    this.config = config;
    log.info('DoubaoASR initialized:', {
      endpoint: config.endpoint || DEFAULT_ENDPOINT,
      appId: config.appId ? `${config.appId.slice(0,4)}...` : '(not set)',
      language: config.language,
    });
  }

  /**
   * Start listening — opens WS connection, sends config, begins receiving results.
   * Call feedPCM() repeatedly to stream audio data.
   */
  async startListening(handlers: ASREventHandlers): Promise<void> {
    if (!this.config?.appId || !this.config?.accessToken) {
      handlers.onError(new Error(
        'Doubao ASR credentials not configured. Set App ID and Access Token in Settings.',
      ));
      return;
    }

    this.handlers = handlers;
    this.seq = 0;
    this.currentUtterance = '';
    this.completedUtterances = [];
    this.finished = false;
    this.reconnectAttempts = 0;

    const endpoint = this.config.endpoint || DEFAULT_ENDPOINT;
    log.info('Connecting to Doubao ASR:', endpoint);

    try {
      await this.connect(endpoint);
      this.sendConfig();
      this.startHeartbeat();
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

    try {
      // Send raw binary PCM data wrapped in a minimal frame envelope
      // Format: JSON header newline + binary PCM data
      const header = new TextEncoder().encode(
        JSON.stringify({ type: PAYLOAD_TYPE.AUDIO, seq: ++this.seq }),
      );
      const newline = new TextEncoder().encode('\n');
      const payload = new Uint8Array(header.length + pcmData.byteLength + newline.length);
      payload.set(header, 0);
      payload.set(new Uint8Array(pcmData), header.length);
      payload.set(newline, header.length + pcmData.byteLength);

      this.ws.send(payload);
    } catch (err) {
      log.warn('Failed to send PCM chunk:', err);
    }
  }

  /**
   * Stop listening — send finish signal, wait for final result, close connection.
   */
  async stopListening(): Promise<void> {
    if (!this.ws) return;

    this.finished = true;
    this.stopHeartbeat();
    log.info('Sending audio_finish signal');

    try {
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
    log.info('Doubao ASR stopped. Utterances:', this.completedUtterances.length);
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

      this.ws.onerror = (_event) => {
        log.error('WebSocket error');
        reject(new Error('Doubao ASR WebSocket connection error'));
      };

      this.ws.onclose = (event) => {
        this.connected = false;
        log.info('WebSocket closed:', event.code, event.reason);

        // Auto-reconnect if not intentionally stopping
        if (!this.finished && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        }
      };
    });
  }

  private sendConfig(): void {
    if (!this.ws || !this.config) return;

    const payload: DoubaoConfigPayload = {
      app: {
        appid: this.config.appId!,
        token: this.config.accessToken!,
        cluster: (this.config.options?.['cluster'] as string) || 'volcengine_streaming_common',
      },
      user: {
        uid: `mobileclaw-${uuid().slice(0, 8)}`,
      },
      audio: {
        format: 'pcm',
        rate: AUDIO_SAMPLE_RATE,
        channel: 1,
        bits: 16,
        language: this.mapLanguage(this.config.language),
      },
      request: {
        reqid: `mc-${Date.now()}-${uuid().slice(0, 8)}`,
        nbest: 1,
        result_type: 'full',       // Request both partial + final results
      },
    };

    log.debug('Sending ASR config:', {
      ...payload,
      app: { ...payload.app, token: '***' },
    });

    this.ws.send(JSON.stringify({
      type: PAYLOAD_TYPE.CONFIG,
      ...payload,
    }));
  }

  /**
   * Map our language code to Volcengine ASR language code.
   */
  private mapLanguage(lang: string): string {
    const map: Record<string, string> = {
      'zh-CN': 'zh-CN',
      'zh': 'zh-CN',
      'en-US': 'en-US',
      'en': 'en-US',
    };
    return map[lang] || 'zh-CN';
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          // Ignore heartbeat errors
        }
      }
    }, 10000); // 10s interval (same as @xmov/doubao-asr SDK)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleMessage(data: string | ArrayBuffer): void {
    // v1 API returns JSON strings; ignore binary responses
    if (typeof data !== 'string') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      log.warn('Failed to parse ASR response:', String(data).slice(0, 200));
      return;
    }

    const msg = parsed as Record<string, unknown>;

    switch (msg.type) {
      case RESULT_TYPE.INTERIM:
      case 'partial_result':
        this.handleInterim(msg as unknown as DoubaoResultPayload);
        break;

      case RESULT_TYPE.FINAL:
      case 'final_result':
        this.handleFinal(msg as unknown as DoubaoResultPayload);
        break;

      case RESULT_TYPE.ERROR:
      case 'error':
        this.handleError(msg as unknown as DoubaoResultPayload);
        break;

      case RESULT_TYPE.FINISHED:
      case 'speech_finished':
        log.info('Server confirmed speech finished');
        break;

      default:
        // Ping response or unknown — silently ignore
        if (msg.type !== 'ping') {
          log.debug('Unknown ASR message type:', msg.type, msg);
        }
    }
  }

  private handleInterim(result: DoubaoResultPayload): void {
    // v1 interim: { type: "partial_result", result: { text: "...", confidence: 0.95 } }
    const text = this.extractText(result);
    if (!text) return;

    const confidence = result.result?.confidence;
    log.debug('Interim:', text.slice(0, 50));

    // Fire onInterim with the full current text (not delta)
    this.handlers?.onInterim(text, confidence);
  }

  private handleFinal(result: DoubaoResultPayload): void {
    // v1 final: { type: "final_result", result: { text: "...", confidence: 0.98 } }
    const text = this.extractText(result);
    if (!text) return;

    const confidence = result.result?.confidence;

    // Check if this is new text beyond what we've already accumulated
    const prevLen = this.currentUtterance.length;

    // v1 may send incremental finals or the complete text each time
    // If the new text starts with our accumulated text, it's an extension
    if (text.startsWith(this.currentUtterance) && text.length > prevLen) {
      const newText = text.slice(prevLen);
      this.currentUtterance = text;
      log.info('Final (incremental):', newText);
      this.handlers?.onFinal(newText, confidence);
    } else if (!text.startsWith(this.currentUtterance)) {
      // Completely new utterance (server reset or new sentence)
      if (this.currentUtterance) {
        // Push previous utterance before starting new one
        this.completedUtterances.push(this.currentUtterance);
      }
      this.currentUtterance = text;
      log.info('Final (new utterance):', text);
      this.handlers?.onFinal(text, confidence);
    }
    // If text === currentUtterance, it's a duplicate confirmation — skip
  }

  private handleError(result: DoubaoResultPayload): void {
    const msg = result.error_message || `ASR error code ${result.error_code}`;
    log.error('Doubao ASR error:', msg);
    this.handlers?.onError(new Error(msg));
  }

  /**
   * Extract text from various server response formats.
   * Handles both v1 ({ result: { text } }) and v3 ({ result: { utterances: [{ text }] } })
   */
  private extractText(result: DoubaoResultPayload): string {
    // v1 format: direct text field
    if (result.result?.text) return result.result.text;

    // v3/SDK format: utterances array — take last one's text
    const utterances = (result.result as unknown as { utterances?: Array<{ text: string }> })?.utterances;
    if (Array.isArray(utterances) && utterances.length > 0) {
      const last = utterances[utterances.length - 1];
      return last.text || '';
    }

    return '';
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);

    log.warn(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectTimer = setTimeout(async () => {
      const endpoint = this.config?.endpoint || DEFAULT_ENDPOINT;
      try {
        await this.connect(endpoint);
        this.sendConfig();
        this.startHeartbeat();
        log.info('Reconnected successfully');
        this.reconnectAttempts = 0;
      } catch (err) {
        log.error('Reconnect failed:', err);
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        } else {
          this.handlers?.onError(new Error('ASR reconnect failed after max attempts'));
        }
      }
    }, delay);
  }

  private close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
