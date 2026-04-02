/**
 * GatewayClient — Core OpenClaw WebSocket client
 *
 * Handles:
 *  1. TCP/WSS connection lifecycle
 *  2. Challenge → Connect(+Device Identity) → Hello-OK authentication handshake
 *  3. RPC call encapsulation (req → wait for matching res)
 *  4. Reconnection with exponential backoff + jitter
 *  5. Heartbeat / tick handling
 *
 * Protocol details discovered via integration testing:
 *  - client.id MUST be a valid GatewayClientId enum value (e.g., 'openclaw-ios')
 *  - client.mode MUST be a valid GatewayClientMode value (e.g., 'ui')
 *  - Device identity (Ed25519 keypair + v3 signed payload) is REQUIRED for scopes
 *  - AI chat uses 'chat.send' RPC (not 'send', which is for channel messages)
 *
 * Based on: openclaw source code & integration tests
 */

import { generateUUID } from '@/utils/rnCompat';
import type {
  GatewayFrame,
  RequestFrame,
  ResponseFrame,
  EventFrame,
  ConnectParams,
  HelloOkPayload,
  ConnectChallengePayload,
} from '@/types/protocol';
import type { ConnectionStatus } from '@/types/session';
import {
  WS_DEFAULT_TIMEOUT_MS,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_MAX_ATTEMPTS,
  HEARTBEAT_INTERVAL_MS,
  PROTOCOL_VERSION,
} from '@/utils/constants';
import { getLogger } from '@/utils/logger';
import { DeviceIdentityService } from './DeviceIdentityService';
import nacl from 'tweetnacl';
import { stringToUint8 } from '@/utils/rnCompat';

const log = getLogger('GatewayClient');

function binaryToString(bytes: Uint8Array): string {
  return String.fromCharCode(...Array.from(bytes));
}

// ─── Types ──────────────────────────────────────────────────────────

type FrameHandler = (frame: GatewayFrame) => void;
type StatusChangeHandler = (status: ConnectionStatus) => void;
type DisconnectHandler = (code: number, reason: string) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/** Device identity stored after generation/pairing */
export interface DeviceIdentity {
  deviceId: string;       // SHA-256 hex of raw public key
  publicKeyB64Url: string; // Raw 32-byte Ed25519 public key, base64url-encoded
  privateKeySeedB64Url: string;   // 32-byte Ed25519 seed, base64url-encoded
}

// ─── GatewayClient ──────────────────────────────────────────────────

export class GatewayClient {
  private ws: WebSocket | null = null;
  private url = '';
  private token = '';

  // Connection state
  private _status: ConnectionStatus = 'disconnected';
  private statusListeners: Set<StatusChangeHandler> = new Set();

  // RPC pending requests
  private pendingRequests = new Map<string, PendingRequest>();

  // Reconnection
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  // Event listeners
  private eventHandlers: Map<string, Set<FrameHandler>> = new Map();
  private disconnectListeners: Set<DisconnectHandler> = new Set();

  // Auth state
  private challengeNonce: string | null = null;
  private helloOkPayload: HelloOkPayload | null = null;

  // Device identity (Ed25519 keypair — generated once, persisted securely)
  private deviceIdentity: DeviceIdentity | null = null;

  get status(): ConnectionStatus {
    return this._status;
  }

  get serverInfo(): HelloOkPayload | null {
    return this.helloOkPayload;
  }

  private describeConnectionError(err: unknown): string {
    if (typeof err === 'string') return err;
    if (err instanceof Error && err.message) return err.message;
    if (err && typeof err === 'object') {
      const maybeMessage = (err as { message?: unknown }).message;
      const maybeType = (err as { type?: unknown }).type;
      if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
      if (typeof maybeType === 'string' && maybeType.trim()) return maybeType;
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    }
    return String(err);
  }

  /**
   * Set the device identity (call before connect()).
   * Generated once on first launch and persisted in SecureStorage.
   */
  setDeviceIdentity(identity: DeviceIdentity): void {
    this.deviceIdentity = identity;
  }

  get hasDeviceIdentity(): boolean {
    return this.deviceIdentity !== null;
  }

  /**
   * Connect to an OpenClaw gateway.
   * Full flow: TCP connect → challenge → connect(+device identity) → hello-ok
   */
  async connect(wsUrl: string, authToken: string): Promise<HelloOkPayload> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      log.warn('Already connected or connecting');
      return Promise.reject(new Error('Already connected'));
    }

    this.url = wsUrl;
    this.token = authToken;
    this.attempt = 0;

    return new Promise((resolve, reject) => {
      let settled = false;
      let step = 'init';

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        log.error(`Connection timed out at step "${step}" after 15s`);
        this.setStatus('error');
        if (this.ws) { this.ws.close(4002, 'connect_timeout'); this.ws = null; }
        reject(new Error(`Gateway connection timed out at step "${step}" (15s)`));
      }, 15000);

      const settle = (result: HelloOkPayload | Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (result instanceof Error) reject(result); else resolve(result);
      };

      try {
        this.setStatus('connecting');
        step = 'tcp-connect';
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          step = 'waiting-challenge';
          log.info('[CONNECT] TCP connected, waiting for challenge...');
        };

        // ─── Inline handshake: challenge → connect req → hello-ok ───
        // Same pattern proven to work by the HomeScreen diagnostic.
        let receivedChallenge = false;

        this.ws.onmessage = (event) => {
          try {
            // CRITICAL: RN may send data as ArrayBuffer (binary) — convert to string
            let raw: string;
            if (typeof event.data === 'string') {
              raw = event.data;
            } else if (event.data instanceof ArrayBuffer) {
              raw = binaryToString(new Uint8Array(event.data));
            } else if (ArrayBuffer.isView(event.data)) {
              raw = binaryToString(new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength));
            } else {
              raw = String(event.data);
            }
            const frame = JSON.parse(raw) as Record<string, unknown>;
            const frameType = frame.type as string;

            log.info('[CONNECT RX]', frameType, '| event:', (frame as Record<string, unknown>).event ?? '-', '| id:', (frame as Record<string, unknown>).id ?? '-');

            if (frameType === 'event' && (frame as Record<string, unknown>).event === 'connect.challenge') {
              // Step 1: Received challenge → send connect request
              step = 'sending-connect';
              receivedChallenge = true;
              const payload = frame.payload as Record<string, unknown>;
              this.challengeNonce = (payload.nonce as string) ?? '';
              log.info('[CONNECT] Got challenge, sending connect request...');

              this.sendConnectRequest();
              step = 'waiting-hello-ok';
              return;
            }

            if (frameType === 'res') {
              // Step 2: Received response — check for hello-ok
              const payload = frame.payload as Record<string, unknown> | undefined;
              const payloadType = payload?.type as string | undefined;

              if (payloadType === 'hello-ok' && !settled) {
                step = 'connected';
                log.info('[CONNECT] ✅ Got hello-ok! Handshake complete.');
                this.helloOkPayload = frame.payload as HelloOkPayload;
                this.setStatus('connected');
                this.attempt = 0;
                this.startHeartbeat();
                settle(this.helloOkPayload);
                return;
              }

              // Handle other res frames (RPC responses) via normal pipeline
              this.handleResponse(frame as unknown as ResponseFrame);

              // If connect was rejected and we haven't settled yet, reject
              const ok = (frame as Record<string, unknown>).ok;
              if (ok === false && !settled && receivedChallenge) {
                const err = frame.error as Record<string, unknown> | undefined;
                settle(new Error(`Server rejected connect: [${err?.code}] ${err?.message}`));
              }
              return;
            }

            // Other frames during connect (tick, health, etc.) — pass to normal handlers
            this.handleFrame(frame as unknown as GatewayFrame);

          } catch (e) {
            log.error('[CONNECT] Failed to process message:', e);
          }
        };

        this.ws.onclose = (event) => {
          log.info('[CONNECT] WS closed:', event.code, event.reason, '| step:', step);
          this.handleDisconnect(event.code, event.reason);
          if (!settled) {
            settle(new Error(`Connection closed at step "${step}": ${event.reason} (${event.code})`));
          }
        };

        this.ws.onerror = (err) => {
          // RN WebSocket often fires spurious onerror after successful handshake
          // Only treat it as real error if we haven't settled yet
          if (!settled) {
            const detail = this.describeConnectionError(err);
            log.warn('[CONNECT] WS error at step:', step, detail);
            this.setStatus('error');
            settle(new Error(`WebSocket error at step "${step}": ${detail}`));
          } else {
            const errWithMessage = err as { message?: string };
            log.warn('[CONNECT] Spurious WS error after connect (ignored):', errWithMessage.message || String(err));
          }
        };
      } catch (e) {
        settle(e as Error);
      }
    });
  }

  private handleFrame(frame: GatewayFrame): void {
    switch (frame.type) {
      case 'event':
        this.handleEvent(frame as unknown as EventFrame);
        break;
      case 'res':
        this.handleResponse(frame as unknown as ResponseFrame);
        break;
      default:
        log.warn('Unknown frame type:', (frame as unknown as Record<string, unknown>).type);
    }
  }

  private handleEvent(event: EventFrame): void {
    if (event.event === 'connect.challenge') {
      const payload = event.payload as ConnectChallengePayload;
      this.challengeNonce = payload.nonce;
      log.info('Received connect challenge, nonce:', payload.nonce?.slice(0, 8) + '...');
      this.sendConnectRequest();
      return;
    }

    const handlers = this.eventHandlers.get(event.event);
    if (handlers) handlers.forEach((handler) => handler(event));

    if (event.event === 'tick') {
      this.lastPongTime = Date.now();
    }
  }

  private handleResponse(res: ResponseFrame): void {
    const pending = this.pendingRequests.get(res.id);
    if (!pending) return; // connect response handled in onmessage

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(res.id);

    if (res.ok) {
      pending.resolve(res.payload);
    } else {
      pending.reject(new Error(`RPC Error [${res.error?.code}]: ${res.error?.message}`));
    }
  }

  /**
   * Send the connect request after receiving challenge.
   * Includes device identity (Ed25519) if available — required for operator.write scope.
   *
   * CRITICAL: All values in the connect params MUST exactly match what we sign in the
   * device auth payload, because the server rebuilds the payload from these params
   * to verify our signature.
   */
  private sendConnectRequest(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.error('Cannot send connect: WebSocket not open');
      return;
    }

    // Build client info — values here are also used in device auth payload signature
    const clientInfo = {
      id: 'openclaw-ios' as const,       // Must be valid GatewayClientId enum
      displayName: 'MobileClaw',
      version: '1.0.0',
      platform: 'ios',
      mode: 'ui' as const,             // Must be valid GatewayClientMode enum
      deviceFamily: 'iPhone',         // Must match what's signed in device payload!
    };

    const connectParams: ConnectParams & Record<string, unknown> = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: clientInfo,
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      auth: { token: this.token },
      locale: 'zh-CN',
      userAgent: 'mobileclaw/1.0.0',
    };

    // If we have device identity, attach it (required for scoped access)
    if (this.deviceIdentity && this.challengeNonce) {
      const deviceAuth = this.buildDeviceAuthObject(clientInfo);
      if (deviceAuth) {
        connectParams.device = deviceAuth as ConnectParams['device'];
      }
    }

    const frame: RequestFrame = {
      type: 'req',
      id: generateUUID(),
      method: 'connect',
      params: connectParams,
    };

    log.info('Sending connect request...',
      this.deviceIdentity ? '(with device identity)' : '(WARNING: no device identity — scopes will be empty)');
    this.sendRaw(JSON.stringify(frame));
  }

  /**
   * Build the device auth object for scoped gateway access.
   */
  private buildDeviceAuthObject(clientInfo: { platform: string; deviceFamily: string }): ConnectParams['device'] | null {
    if (!this.deviceIdentity || !this.challengeNonce) return null;
    const signedAt = Date.now();
    const scopes = ['operator.read', 'operator.write'];
    const payload = this.buildDeviceAuthPayload({
      deviceId: this.deviceIdentity.deviceId,
      clientId: 'openclaw-ios',
      clientMode: 'ui',
      role: 'operator',
      scopes,
      signedAtMs: signedAt,
      token: this.token,
      nonce: this.challengeNonce,
      platform: clientInfo.platform,
      deviceFamily: clientInfo.deviceFamily,
    });

    const secretKey = DeviceIdentityService.getSecretKey(this.deviceIdentity);
    const signature = nacl.sign.detached(stringToUint8(payload), secretKey);

    return {
      id: this.deviceIdentity.deviceId,
      publicKey: this.deviceIdentity.publicKeyB64Url,
      signature: DeviceIdentityService.toBase64Url(signature),
      signedAt,
      nonce: this.challengeNonce,
    };
  }

  private buildDeviceAuthPayload(params: {
    deviceId: string;
    clientId: string;
    clientMode: string;
    role: string;
    scopes: string[];
    signedAtMs: number;
    token: string;
    nonce: string;
    platform: string;
    deviceFamily: string;
  }): string {
    const normalize = (value: string): string => value.trim().replace(/[A-Z]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) + 32));

    return [
      'v3',
      params.deviceId,
      params.clientId,
      params.clientMode,
      params.role,
      params.scopes.join(','),
      String(params.signedAtMs),
      params.token,
      params.nonce,
      normalize(params.platform),
      normalize(params.deviceFamily),
    ].join('|');
  }

  /**
   * Make an RPC call — sends a req frame and waits for matching res frame.
   * Use chat.send for AI conversation (not 'send' which is for channel messages).
   */
  async rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const id = generateUUID();

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, WS_DEFAULT_TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, reject, timeout } as PendingRequest);

      const frame: RequestFrame = { type: 'req', id, method, params };
      this.sendRaw(JSON.stringify(frame));
    });
  }

  /**
   * Send a message to the AI agent via chat.send RPC.
   * Convenience wrapper around rpc('chat.send', ...).
   */
  async chatSend(message: string, options?: { sessionKey?: string; attachments?: Array<Record<string, unknown>> }): Promise<unknown> {
    return this.rpc('chat.send', {
      sessionKey: options?.sessionKey ?? 'main:webchat:mobileclaw',
      message,
      idempotencyKey: `mobileclaw-${Date.now()}-${generateUUID().slice(0, 8)}`,
      ...(options?.attachments ? { attachments: options.attachments } : {}),
    });
  }

  async chatHistory(sessionKey: string, limit: number = 20): Promise<unknown> {
    return this.rpc('chat.history', { sessionKey, limit });
  }

  private sendRaw(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      log.warn('Cannot send: WebSocket not open');
    }
  }

  sendEvent(eventName: string, payload?: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const frame: EventFrame = { type: 'event', event: eventName, payload };
    this.sendRaw(JSON.stringify(frame));
  }

  // ─── Reconnection ───────────────────────────────────────────────

  private lastPongTime = 0;

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastPongTime = Date.now();

    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastPongTime > HEARTBEAT_INTERVAL_MS * 2) {
        log.warn('No heartbeat response for 30s, closing connection');
        this.ws.close(4001, 'heartbeat_timeout');
        return;
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleDisconnect(code: number, reason: string): void {
    this.stopHeartbeat();
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Connection closed: ${reason}`));
    }
    this.pendingRequests.clear();
    this.disconnectListeners.forEach((handler) => handler(code, reason));

    if (code === 1000 || code === 1001) {
      this.setStatus('disconnected');
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.attempt >= RECONNECT_MAX_ATTEMPTS) {
      log.error('Max reconnection attempts reached');
      this.setStatus('error');
      this.disconnectListeners.forEach((handler) => handler(-1, 'Max reconnect attempts reached'));
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.attempt),
      RECONNECT_MAX_DELAY_MS,
    ) * (0.5 + Math.random() * 0.5);

    this.attempt++;
    this.setStatus('reconnecting');
    log.info(`Reconnecting in ${Math.round(delay)}ms (attempt ${this.attempt}/${RECONNECT_MAX_ATTEMPTS})`);

    this.reconnectTimer = setTimeout(() => {
      if (this.url && this.token) {
        this.connect(this.url, this.token).catch((err) => {
          log.info('Reconnect failed:', err.message);
        });
      }
    }, delay);
  }

  // ─── Status Management ─────────────────────────────────────────

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusListeners.add(handler);
    return () => this.statusListeners.delete(handler);
  }

  onDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectListeners.add(handler);
    return () => this.disconnectListeners.delete(handler);
  }

  onEvent(eventName: string, handler: FrameHandler): () => void {
    if (!this.eventHandlers.has(eventName)) this.eventHandlers.set(eventName, new Set());
    this.eventHandlers.get(eventName)!.add(handler);
    return () => this.eventHandlers.get(eventName)?.delete(handler);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.attempt = RECONNECT_MAX_ATTEMPTS;

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setStatus('disconnected');
    this.helloOkPayload = null;
    this.challengeNonce = null;
  }

  destroy(): void {
    this.disconnect();
    this.statusListeners.clear();
    this.eventHandlers.clear();
    this.disconnectListeners.clear();
  }
}

// ─── Singleton ─────────────────────────────────────────────────────

export const gatewayClient = new GatewayClient();
