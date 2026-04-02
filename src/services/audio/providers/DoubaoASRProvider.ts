/**
 * DoubaoASRProvider - Volcengine/Doubao streaming speech recognition
 *
 * Official binary protocol (v3):
 *   - Auth via HTTP headers: X-Api-App-Key, X-Api-Access-Key, etc.
 *   - Binary frames: 4B header + 4B seq/size + gzip payload
 *   - Endpoint: wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream
 *
 * Uses native HeaderWebSocket module for custom HTTP header support.
 * Reference: sauc_websocket_demo.py (official Python demo)
 */

import type { ASRProvider, ASREventHandlers } from '../ASRService';
import type { ASRProviderConfig } from '@/types/config';
import { getLogger } from '@/utils/logger';
import { AUDIO_SAMPLE_RATE } from '@/utils/constants';
import { generateUUID, stringToUint8, uint8ToString } from '@/utils/rnCompat';
import { NativeModules, NativeEventEmitter } from 'react-native';
import { gzipSync, unzipSync } from 'fflate';

const log = getLogger('DoubaoASR');

const DEFAULT_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream';
const DEFAULT_RESOURCE_ID = 'volc.bigasr.sauc.duration';

// Message types (4-bit values, shifted into upper nibble by buildHeader)
// Reference: sauc_websocket_demo.py official demo
const MT_CLIENT_FULL  = 0x01;
const MT_CLIENT_AUDIO = 0x02;
const MT_SERVER_FULL  = 0x09;
const MT_SERVER_ERR   = 0x0F;

// Flags (lower nibble of byte 1)
const F_POS_SEQ    = 0x01;
const F_NEG_WSEQ   = 0x03;

interface ServerResp {
  mt: number;
  isLast: boolean;
  errorCode?: number | null;
  json?: {
    result?: { text?: string; utterances?: Array<{ text: string; definite?: boolean }> };
    error_code?: number;
    error_message?: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

function u8alloc(n: number): Uint8Array { return new Uint8Array(n); }
function w32(buf: Uint8Array, o: number, v: number): void {
  buf[o]=(v>>>24)&0xff; buf[o+1]=(v>>>16)&0xff; buf[o+2]=(v>>>8)&0xff; buf[o+3]=v&0xff;
}
function r32(b: Uint8Array, o: number): number {
  return ((b[o]&0xff)<<24)|((b[o+1]&0xff)<<16)|((b[o+2]&0xff)<<8)|(b[o+3]&0xff);
}
function concat(...p: Uint8Array[]): Uint8Array {
  const t = p.reduce((s,x)=>s+x.length,0), r=new Uint8Array(t); let o=0;
  for(const x of p){r.set(x,o);o+=x.length;} return r;
}
function toU8(d: ArrayBuffer|Uint8Array): Uint8Array {
  return d instanceof Uint8Array ? d : new Uint8Array(d);
}

// ─── Binary Protocol ───────────────────────────────────────────────

function buildHeader(mt: number, f: number): Uint8Array {
  const b=u8alloc(4); b[0]=0x11; b[1]=((mt&0x0f)<<4)|(f&0x0f); b[2]=0x11; b[3]=0x00; return b;
}

function buildConfigFrame(payload: object, seq: number): Uint8Array {
  const c=gzipSync(stringToUint8(JSON.stringify(payload)));
  const h=buildHeader(MT_CLIENT_FULL,F_POS_SEQ);
  const s=u8alloc(4); w32(s,0,seq); const sz=u8alloc(4); w32(sz,0,c.length);
  return concat(h,s,sz,c);
}

function buildAudioFrame(data: ArrayBuffer|Uint8Array, seq: number, last: boolean): Uint8Array {
  const input=toU8(data), c=gzipSync(input);
  const h=buildHeader(MT_CLIENT_AUDIO, last?F_NEG_WSEQ:F_POS_SEQ);
  const s=u8alloc(4); w32(s,0,last?-seq:seq); const sz=u8alloc(4); w32(sz,0,c.length);
  return concat(h,s,sz,c);
}

function parseResponse(raw: ArrayBuffer|Uint8Array): ServerResp|null {
  const b=toU8(raw); if(b.length<5) return null;
  const hs=b[0]&0xf, mt=(b[1]>>4)&0xf, fl=b[1]&0xf, sr=(b[2]>>4)&0xf, cp=b[2]&0xf;
  let off=hs*4, isLast=(fl&0x02)!==0, ec:number|null=null, psz=0;
  if((fl&0x01)&&off+4<=b.length){off+=4;}
  if(mt===MT_SERVER_FULL&&off+4<=b.length){psz=r32(b,off);off+=4;}
  else if(mt===MT_SERVER_ERR&&off+8<=b.length){ec=r32(b,off);psz=r32(b,off+4);off+=8;}
  let p=b.slice(off);
  if(cp===1&&p.length>0){try{p=new Uint8Array(unzipSync(p) as any);}catch{return null;}}
  let j:ServerResp['json']|undefined;
  if(sr===1&&p.length>0){try{j=JSON.parse(uint8ToString(p)) as ServerResp['json'];}catch{}}
  return{mt,isLast,json:j,errorCode:ec};
}

// ─── Native Module Access (lazy to avoid crash on import) ────────

function getHeaderWS() {
  try { return NativeModules.HeaderWebSocket; } catch { return null; }
}

function getHeaderWSEmitter() {
  const mod = getHeaderWS();
  return mod ? new NativeEventEmitter(mod) : null;
}

// ─── Provider ──────────────────────────────────────────────────────

export class DoubaoASRProvider implements ASRProvider {
  private hws: any = null;
  private subscriptions: any[] = [];
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
  private audioFramesSent = 0;
  private terminalErrorSeen = false;
  private reconnecting = false;
  private reconnectPromise: Promise<void> | null = null;
  private endpoint = '';
  private resourceId = '';
  private connectionId = '';

  private isBenignSocketError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('socket is not connected') ||
      normalized.includes('socket not connected') ||
      normalized.includes('closed') ||
      normalized.includes('not open')
    );
  }

  async initialize(cfg: ASRProviderConfig): Promise<void> {
    this.cfg = cfg;
    log.info('DoubaoASR init', { endpoint: cfg.endpoint||DEFAULT_ENDPOINT, appId: cfg.appId?.slice(0,4) });
  }

  async startListening(h: ASREventHandlers): Promise<void> {
    if (!this.cfg?.appId || !this.cfg?.accessToken) {
      const err = new Error('Missing App ID or Access Token');
      h.onError(err);
      throw err; // 向上抛出，让调用者知道
    }
    this.handlers = h;
    this.resetRecognitionSessionState();
    this.reconnects = 0;

    const ep = this.cfg.endpoint || DEFAULT_ENDPOINT;
    const rid = (this.cfg.options?.['resourceId'] as string) || DEFAULT_RESOURCE_ID;
    const cid = generateUUID();
    this.endpoint = ep;
    this.resourceId = rid;
    this.connectionId = cid;
    this.reconnecting = false;

    log.info('[ASR] Connecting...', ep);
    try {
      await this.connect(ep, rid, cid);
      this.sendConfig();
      log.info('[ASR] Ready for PCM audio');
    } catch(e) {
      log.error('[ASR] Connect failed:', e);
      h.onError(e instanceof Error ? e : new Error(String(e)));
      throw e; // 向上抛出
    }
  }

  feedPCM(data: ArrayBuffer | Uint8Array): void {
    if (!this.hws || !this.connected || this.finished) return;
    try {
      const frame = buildAudioFrame(data, this.seq++, false);
      this.audioFramesSent += 1;
      if (this.audioFramesSent === 1) {
        log.info('[ASR] First audio frame sent');
      }
      this.hws.sendData(Array.from(frame)).catch(() => {});
    } catch {}
  }

  async stopListening(): Promise<void> {
    if (!this.hws) return; this.finished = true;
    this.reconnecting = false;
    try {
      if (this.connected) {
        this.hws.sendData(Array.from(buildAudioFrame(new Uint8Array(0), this.seq++, true))).catch(() => {});
        await new Promise(r=>setTimeout(r,1500));
      }
    } catch{}
    this.close(); log.info('[ASR] Stopped.');
  }
  async destroy(): Promise<void> { await this.stopListening(); }
  async prepareNextTurn(): Promise<void> {
    if (!this.hws || !this.connected || this.reconnecting) return;
    log.info('[ASR] Proactively preparing next turn');
    await this.reconnectCurrentSession();
  }

  // ─── Internal ───────────────────────────────────────────────────

  /** Build HTTP headers matching official Python demo */
  private buildHeaders(rid: string, cid: string): Record<string, string> {
    return {
      'X-Api-App-Key': this.cfg!.appId!,
      'X-Api-Access-Key': this.cfg!.accessToken!,
      'X-Api-Resource-Id': rid,
      'X-Api-Request-Id': cid,
    };
  }

  private connect(ep: string, rid: string, cid: string): Promise<void> {
    this.hws = getHeaderWS();
    if (!this.hws) throw new Error('HeaderWebSocket native module not available');

    const headers = this.buildHeaders(rid, cid);
    log.info('[ASR] Headers:', Object.keys(headers).join(', '));

    const emitter = getHeaderWSEmitter();
    if (!emitter) throw new Error('HeaderWebSocket event emitter not available');

    const subMsg = emitter.addListener('onMessage', (data: any) => {
      if (data && data.type === 'binary' && Array.isArray(data.data)) {
        this.onMessage(new Uint8Array(data.data));
      }
    });
    const subErr = emitter.addListener('onError', (data: any) => {
      const message = typeof data?.message === 'string' ? data.message : 'WS error';
      if (this.finished || (this.isBenignSocketError(message) && !this.connected)) {
        log.info('[ASR] Ignoring socket error during shutdown:', message);
        return;
      }
      log.warn('[ASR] WS error:', message);
      this.handlers?.onError(new Error(message));
    });
    const subClose = emitter.addListener('onClose', (data: any) => {
      log.info('[ASR] WS closed:', data?.code, data?.reason);
      this.connected = false;
      if (!this.finished && this.reconnects < this.maxReconnects) {
        void this.reconnect(ep, rid, cid);
      }
    });
    this.subscriptions = [subMsg, subErr, subClose];

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return; settled = true;
        reject(new Error('Timeout 10s'));
      }, 10000);

      this.hws!.connect(ep, headers).then(() => {
        if (settled) return; settled = true; clearTimeout(timer);
        this.connected = true;
        log.info('[ASR] ✅ Connected!');
        resolve(undefined);
      }).catch((err: any) => {
        if (settled) return; settled = true; clearTimeout(timer);
        reject(new Error('Connect failed: ' + String(err?.message || err)));
      });
    });
  }

  private sendConfig(): void {
    if (!this.hws || !this.connected || !this.cfg) return;
    const frame = buildConfigFrame({
      user:{uid:`mc-${generateUUID().slice(0,8)}`,did:'rn-app',platform:'ReactNative',sdk_version:'1.0.0',app_version:'1.0.0'},
      audio:{format:'pcm',codec:'raw',rate:AUDIO_SAMPLE_RATE,bits:16,channel:1},
      request:{model_name:'bigmodel',enable_itn:true,enable_punc:true,enable_ddc:false,
              show_utterances:true,result_type:'full',end_window_size:800,force_to_speech_time:1000},
    }, this.seq++);
    this.hws.sendData(Array.from(frame)).catch((e:any) => {
      log.error('[ASR] Send config failed:', e);
    });
  }

  private onMessage(data: Uint8Array): void {
    const r = parseResponse(data); if (!r) return;
    if (this.audioFramesSent > 0 && this.audioFramesSent < 5) {
      log.info('[ASR] Received server response type:', r.mt, 'isLast=', r.isLast);
    }
    if (r.mt === MT_SERVER_FULL) this.onFullResp(r);
    else if (r.mt === MT_SERVER_ERR) this.onErrResp(r);
  }

  private onFullResp(r: ServerResp): void {
    const res = r.json?.result; if (!res) return;
    for (const u of (res.utterances||[]).filter((u:any) => u.definite))
      if (u.text && !this.doneUtterances.includes(u.text)) {
        this.doneUtterances.push(u.text);
        log.info('[ASR] Final:', u.text);
        this.handlers?.onFinal(u.text, undefined);
      }
    const interim = (res.utterances||[]).filter((u:any) => !u.definite);
    if (interim.length > 0) {
      const l = interim[interim.length - 1];
      if (l.text !== this.interimText) {
        this.interimText = l.text ?? '';
        this.handlers?.onInterim(l.text ?? '', undefined);
      }
    }
    if (res.text && (!res.utterances || res.utterances.length === 0) && res.text !== this.interimText) {
      this.interimText = res.text;
      this.handlers?.onInterim(res.text, undefined);
    }
    if (r.isLast) log.info('[ASR] Last pkg received');
  }

  private onErrResp(r: ServerResp): void {
    const code = r.json?.error_code ?? r.errorCode ?? 0;
    const msg = r.json?.error_message ?? `ASR err ${code}`;
    const isRecoverableTurnBoundary = code === 45000081;

    if (isRecoverableTurnBoundary) {
      if (this.reconnecting || this.finished) return;

      this.terminalErrorSeen = true;
      log.info('[ASR] Turn finished, recycling recognizer session:', msg, {
        audioFramesSent: this.audioFramesSent,
        seq: this.seq,
      });
      this.reconnectCurrentSession();
      return;
    }

    if (this.terminalErrorSeen) return;
    this.terminalErrorSeen = true;
    this.finished = true;
    log.warn('[ASR] Server terminal error:', msg);
    this.close();
    this.handlers?.onError(new Error(msg));
  }

  private reconnect(ep: string, rid: string, cid: string): Promise<void> {
    if (this.reconnecting) {
      return this.reconnectPromise ?? Promise.resolve();
    }
    if (this.finished) {
      return Promise.resolve();
    }

    this.reconnecting = true;
    this.reconnects++;
    const d = Math.min(1000 * Math.pow(2, this.reconnects - 1), 10000);
    log.warn(`[ASR] Reconnect ${d}ms (${this.reconnects}/${this.maxReconnects})`);
    this.reconnectPromise = new Promise((resolve, reject) => {
      this.rcTimer = setTimeout(async () => {
        try {
          const nextConnectionId = generateUUID();
          this.connectionId = nextConnectionId;
          await this.connect(ep, rid, nextConnectionId);
          this.sendConfig();
          log.info('[ASR] Reconnected');
          this.reconnects = 0;
          this.reconnecting = false;
          this.terminalErrorSeen = false;
          this.reconnectPromise = null;
          resolve();
        } catch(e) {
          log.error('[ASR] Recon fail:', e);
          this.reconnecting = false;
          this.close();
          if (this.reconnects < this.maxReconnects) {
            this.reconnectPromise = null;
            try {
              await this.reconnect(ep, rid, cid);
              resolve();
            } catch (retryError) {
              reject(retryError);
            }
          } else {
            this.reconnectPromise = null;
            const error = new Error('Recon exhausted');
            this.handlers?.onError(error);
            reject(error);
          }
        }
      }, d);
    });

    return this.reconnectPromise;
  }

  private reconnectCurrentSession(): Promise<void> {
    this.close();
    if (!this.endpoint || !this.resourceId || !this.connectionId) {
      return Promise.resolve();
    }
    this.resetRecognitionSessionState();
    return this.reconnect(this.endpoint, this.resourceId, this.connectionId);
  }

  private resetRecognitionSessionState(): void {
    this.seq = 1;
    this.finished = false;
    this.connected = false;
    this.interimText = '';
    this.doneUtterances = [];
    this.audioFramesSent = 0;
    this.terminalErrorSeen = false;
  }

  private close(): void {
    if (this.subscriptions) {
      for (const s of this.subscriptions) { try { s.remove(); } catch {} }
      this.subscriptions = [];
    }
    if (this.rcTimer) { clearTimeout(this.rcTimer); this.rcTimer = null; }
    if (this.hws) { try { this.hws.close().catch(()=>{}); } catch {} this.hws = null; }
    this.connected = false;
  }
}
