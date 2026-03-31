/**
 * DoubaoASRProvider - Volcengine/Doubao streaming speech recognition
 *
 * Official binary protocol (v3):
 *   - Auth via HTTP headers: X-Api-App-Key, X-Api-Access-Key, X-Api-Resource-Id
 *   - Binary frames: 4B header + 4B seq/size + gzip payload
 *   - Endpoint: wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async *
 * RN Note: Built-in WebSocket does not support custom HTTP headers on upgrade.
 *          For production, replace with a native WS module (e.g. ThermalWS)
 *          or bridge to platform-native Volcengine SDK.
 *          This impl passes credentials via query params as fallback.
 *
 * Reference: sauc_websocket_demo.py (official Python demo)
 */

import type { ASRProvider, ASREventHandlers } from '../ASRService';
import type { ASRProviderConfig } from '@/types/config';
import { getLogger } from '@/utils/logger';
import { AUDIO_SAMPLE_RATE } from '@/utils/constants';
import { v4 as uuid } from 'uuid';
// pako has no @types package — suppress import type error
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { gzip, ungzip } = require('pako') as { gzip: (d: Uint8Array) => Uint8Array; ungzip: (d: Uint8Array) => Uint8Array };

const log = getLogger('DoubaoASR');

const DEFAULT_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';
const DEFAULT_RESOURCE_ID = 'volc.bigasr.sauc.duration';

// Message types (upper nibble of byte 1)
const MT_CLIENT_FULL  = 0x10;
const MT_CLIENT_AUDIO = 0x20;
const MT_SERVER_FULL  = 0x90;
const MT_SERVER_ERR   = 0xF0;

// Flags (lower nibble of byte 1)
const F_NO_SEQ     = 0x00;
const F_POS_SEQ    = 0x01;
const F_NEG_SEQ    = 0x02;
const F_NEG_WSEQ   = 0x03;

interface ServerResp {
  msgType: number;
  isLast: boolean;
  errorCode?: number | null;
  json?: {
    result?: {
      text?: string;
      utterances?: Array<{ text: string; definite?: boolean }>;
    };
    error_code?: number;
    error_message?: string;
  };
}

// ─── Uint8Array Helpers (RN-compatible Buffer replacement) ────────

function u8alloc(n: number): Uint8Array {
  return new Uint8Array(n);
}

function writeU32BE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset]     = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>> 8) & 0xff;
  buf[offset + 3] = val & 0xff;
}

function readU32BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] & 0xff) << 24) |
         ((buf[offset + 1] & 0xff) << 16) |
         ((buf[offset + 2] & 0xff) << 8) |
         (buf[offset + 3] & 0xff);
}

function readI32BE(buf: Uint8Array, offset: number): number {
  const v = readU32BE(buf, offset);
  return v | 0; // convert to signed int32
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    result.set(p, off);
    off += p.length;
  }
  return result;
}

function toU8(data: ArrayBuffer | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

// ─── Binary Protocol ───────────────────────────────────────────────

function buildHeader(msgType: number, flags: number): Uint8Array {
  const b = u8alloc(4);
  b[0] = 0x11; // version=1, header_size=1
  b[1] = (msgType << 4) | flags;
  b[2] = 0x11; // json serialization + gzip compression
  b[3] = 0x00;
  return b;
}

function buildConfigFrame(payload: object, seq: number): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  const compressed = gzip(jsonBytes);
  const hdr = buildHeader(MT_CLIENT_FULL, F_POS_SEQ);
  const seqBuf = u8alloc(4); writeU32BE(seqBuf, 0, seq);
  const szBuf = u8alloc(4); writeU32BE(szBuf, 0, compressed.length);
  return concat(hdr, seqBuf, szBuf, compressed);
}

function buildAudioFrame(data: ArrayBuffer | Uint8Array, seq: number, isLast: boolean): Uint8Array {
  const input = toU8(data);
  const compressed = gzip(input);
  const flags = isLast ? F_NEG_WSEQ : F_POS_SEQ;
  const actualSeq = isLast ? -seq : seq;
  const hdr = buildHeader(MT_CLIENT_AUDIO, flags);
  const seqBuf = u8alloc(4); writeU32BE(seqBuf, 0, actualSeq);
  const szBuf = u8alloc(4); writeU32BE(szBuf, 0, compressed.length);
  return concat(hdr, seqBuf, szBuf, compressed);
}

function parseResponse(raw: ArrayBuffer | Uint8Array): ServerResp | null {
  const b = toU8(raw);
  if (b.length < 5) return null;

  const hdrSize = (b[0] & 0x0f);
  const msgType = (b[1] >> 4) & 0x0f;
  const flags = b[1] & 0x0f;
  const serial = (b[2] >> 4) & 0x0f;
  const compress = b[2] & 0x0f;
  let off = hdrSize * 4;
  const isLast = (flags & 0x02) !== 0;

  let respSeq: number | null = null;
  if ((flags & 0x01) !== 0 && off + 4 <= b.length) {
    respSeq = readI32BE(b, off); off += 4;
  }

  let errCode: number | null = null;
  let paySz = 0;

  if (msgType === MT_SERVER_FULL && off + 4 <= b.length) {
    paySz = readU32BE(b, off); off += 4;
  } else if (msgType === MT_SERVER_ERR && off + 8 <= b.length) {
    errCode = readI32BE(b, off); off += 4;
    paySz = readU32BE(b, off); off += 4;
  }

  let payload = b.slice(off);
  if (compress === 1 && payload.length > 0) {
    try { payload = new Uint8Array(ungzip(payload)); } catch { return null; }
  }

  let json: ServerResp['json'] | undefined;
  if (serial === 1 && payload.length > 0) {
    try { json = JSON.parse(new TextDecoder().decode(payload)) as ServerResp['json']; } catch { /* ignore */ }
  }

  return { msgType, isLast, json, errorCode: errCode };
}

// ─── Provider ──────────────────────────────────────────────────────

export class DoubaoASRProvider implements ASRProvider {
  private ws: WebSocket | null = null;
  private cfg: ASRProviderConfig | null = null;
  private handlers: ASREventHandlers | null = null;
  private seq = 1;
  private finished = false;
  private interimText = '';
  private doneUtterances: string[] = [];
  private reconnects = 0;
  private maxReconnects = 3;
  private rcTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  async initialize(cfg: ASRProviderConfig): Promise<void> {
    this.cfg = cfg;
    log.info('DoubaoASR init (v3 binary protocol)', {
      endpoint: cfg.endpoint || DEFAULT_ENDPOINT,
      appId: cfg.appId?.slice(0, 4),
      resource: (cfg.options?.['resourceId'] as string) || DEFAULT_RESOURCE_ID,
    });
  }

  async startListening(h: ASREventHandlers): Promise<void> {
    if (!this.cfg?.appId || !this.cfg?.accessToken) {
      h.onError(new Error('Missing App ID or Access Token'));
      return;
    }
    this.handlers = h;
    this.seq = 1;
    this.interimText = '';
    this.doneUtterances = [];
    this.finished = false;
    this.reconnects = 0;

    const ep = this.cfg.endpoint || DEFAULT_ENDPOINT;
    const rid = (this.cfg.options?.['resourceId'] as string) || DEFAULT_RESOURCE_ID;
    const cid = uuid();

    log.info('Connecting...', ep);
    try {
      await this.connect(ep, rid, cid);
      this.sendConfig();
      log.info('Ready for PCM audio');
    } catch (e) {
      log.error('Connect failed:', e);
      h.onError(e instanceof Error ? e : new Error(String(e)));
    }
  }

  feedPCM(data: ArrayBuffer | Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.finished) return;
    try {
      this.ws.send(buildAudioFrame(data, this.seq++, false));
    } catch (e) { log.warn('send PCM failed:', e); }
  }

  async stopListening(): Promise<void> {
    if (!this.ws) return;
    this.finished = true;
    log.info('Sending finish...');
    try {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(buildAudioFrame(new Uint8Array(0), this.seq, true));
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch { /* ignore */ }
    this.close();
    log.info('Stopped. Utterances:', this.doneUtterances.length);
  }

  async destroy(): Promise<void> { await this.stopListening(); }

  // ─── Internal ───────────────────────────────────────────────────

  private buildAuthUrl(ep: string, rid: string, cid: string): string {
    // RN WebSocket does not support custom HTTP headers on upgrade.
    // Pass credentials as query parameters as fallback.
    // Production: swap to native WS module (ThermalWS / platform SDK).
    const url = new URL(ep);
    url.searchParams.set('appkey', this.cfg!.appId!);
    url.searchParams.set('access_token', this.cfg!.accessToken!);
    url.searchParams.set('resource_id', rid);
    url.searchParams.set('connect_id', cid);
    url.searchParams.set('request_id', cid);
    return url.toString();
  }

  private async connect(ep: string, rid: string, cid: string): Promise<void> {
    const url = this.buildAuthUrl(ep, rid, cid);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connected = true;
        resolve(undefined);
      };

      this.ws.onmessage = (ev: MessageEvent) => {
        const d = ev.data instanceof ArrayBuffer
          ? ev.data
          : typeof ev.data === 'string'
            ? new TextEncoder().encode(ev.data).buffer
            : ev.data;
        this.onMessage(new Uint8Array(d as ArrayBuffer));
      };

      this.ws.onerror = () => reject(new Error('WS error'));

      this.ws.onclose = () => {
        this.connected = false;
        if (!this.finished && this.reconnects < this.maxReconnects) {
          this.reconnect(ep, rid, cid);
        }
      };
    });
  }

  private sendConfig(): void {
    if (!this.ws || !this.cfg) return;
    const frame = buildConfigFrame({
      user: { uid: `mc-${uuid().slice(0, 8)}`, did: 'rn-app', platform: 'ReactNative', sdk_version: '1.0.0', app_version: '1.0.0' },
      audio: { format: 'pcm', codec: 'raw', rate: AUDIO_SAMPLE_RATE, bits: 16, channel: 1 },
      request: {
        model_name: 'bigmodel',
        enable_itn: true, enable_punc: true, enable_ddc: false,
        show_utterances: true, result_type: 'full',
        end_window_size: 800, force_to_speech_time: 1000,
      },
    }, this.seq++);
    this.ws!.send(frame.buffer ?? frame);
  }

  private onMessage(data: Uint8Array): void {
    const r = parseResponse(data);
    if (!r) return;

    if (r.msgType === MT_SERVER_FULL) this.onFullResp(r);
    else if (r.msgType === MT_SERVER_ERR) this.onErrResp(r);
  }

  private onFullResp(r: ServerResp): void {
    const res = r.json?.result;
    if (!res) return;

    const utts = res.utterances || [];
    for (const u of utts.filter((u: { text?: string; definite?: boolean }) => u.definite)) {
      if (u.text && !this.doneUtterances.includes(u.text)) {
        this.doneUtterances.push(u.text);
        log.info('Final:', u.text);
        this.handlers?.onFinal(u.text, undefined);
      }
    }
    const interim = utts.filter((u: { text?: string; definite?: boolean }) => !u.definite);
    if (interim.length > 0) {
      const last = interim[interim.length - 1];
      if (last.text !== this.interimText) {
        this.interimText = last.text ?? '';
        this.handlers?.onInterim(last.text ?? '', undefined);
      }
    }
    if (res.text && utts.length === 0 && res.text !== this.interimText) {
      this.interimText = res.text;
      this.handlers?.onInterim(res.text, undefined);
    }
    if (r.isLast) log.info('Server last-pkg received');
  }

  private onErrResp(r: ServerResp): void {
    const code = r.json?.error_code ?? r.errorCode ?? 0;
    const msg = r.json?.error_message ?? `ASR err ${code}`;
    log.error('Server error:', msg);
    this.handlers?.onError(new Error(msg));
  }

  private reconnect(ep: string, rid: string, cid: string): void {
    this.reconnects++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnects - 1), 10000);
    log.warn(`Reconnect in ${delay}ms (${this.reconnects}/${this.maxReconnects})`);
    this.rcTimer = setTimeout(async () => {
      try {
        await this.connect(ep, rid, uuid());
        this.sendConfig();
        log.info('Reconnected');
        this.reconnects = 0;
      } catch (e) {
        log.error('Reconnect fail:', e);
        if (this.reconnects < this.maxReconnects) this.reconnect(ep, rid, cid);
        else this.handlers?.onError(new Error('Reconnect exhausted'));
      }
    }, delay);
  }

  private close(): void {
    if (this.rcTimer) { clearTimeout(this.rcTimer); this.rcTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch { /* */ } this.ws = null; }
    this.connected = false;
    this.finished = false;
  }
}
