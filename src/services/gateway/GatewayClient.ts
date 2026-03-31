/**
 * GatewayClient — Core OpenClaw WebSocket client
 *
 * Handles:
 *  1. TCP/WSS connection lifecycle
 *  2. Challenge → Connect → Hello-OK authentication handshake
 *  3. RPC call encapsulation (req → wait for matching res)
 *  4. Reconnection with exponential backoff + jitter
 *  5. Heartbeat / tick handling
 *
 * Based on: openclaw docs/gateway/protocol.md
 */

import { v4 as uuid } from 'uuid';
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

const log = getLogger('GatewayClient');

// ─── Types ──────────────────────────────────────────────────────────

type FrameHandler = (frame: GatewayFrame) => void;
type StatusChangeHandler = (status: ConnectionStatus) => void;
type DisconnectHandler = (code: number, reason: string) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
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

  get status(): ConnectionStatus {
    return this._status;
  }

  get serverInfo(): HelloOkPayload | null {
    return this.helloOkPayload;
  }

  /**
   * Connect to an OpenClaw gateway.
   * Full flow: TCP connect → receive challenge → send connect → receive hello-ok
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
      try {
        this.setStatus('connecting');
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          log.info('WebSocket connection opened to', wsUrl);
          // Server will send connect.challenge; we handle it in onmessage
        };

        this.ws.onmessage = (event) => {
          try {
            const frame: GatewayFrame = JSON.parse(typeof event.data === 'string' ? event.data : '');
            this.handleFrame(frame);

            // Resolve connect promise when we receive hello-ok
            if (
              frame.type === 'res' &&
              (frame as ResponseFrame).payload &&
              ((frame as ResponseFrame).payload as Record<string, unknown>).type === 'hello-ok'
            ) {
              this.helloOkPayload = (frame as ResponseFrame).payload as HelloOkPayload;
              this.setStatus('connected');
              this.attempt = 0; // Reset reconnection counter
              this.startHeartbeat();
              resolve(this.helloOkPayload);
            }
          } catch (e) {
            log.error('Failed to parse frame', e);
          }
        };

        this.ws.onclose = (event) => {
          log.info('WebSocket closed', event.code, event.reason);
          this.handleDisconnect(event.code, event.reason);
          // Reject the connect promise if not yet resolved
          if (this._status === 'connecting') {
            reject(new Error(`Connection closed: ${event.reason} (${event.code})`));
          }
        };

        this.ws.onerror = (event) => {
          log.error('WebSocket error', event);
          this.setStatus('error');
          if (this._status === 'connecting') {
            reject(new Error('WebSocket connection error'));
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Handle incoming frames from the gateway
   */
  private handleFrame(frame: GatewayFrame): void {
    switch (frame.type) {
      case 'event':
        this.handleEvent(frame as EventFrame);
        break;

      case 'res':
        this.handleResponse(frame as ResponseFrame);
        break;

      default:
        log.warn('Unknown frame type:', (frame as Record<string, unknown>).type);
    }
  }

  private handleEvent(event: EventFrame): void {
    // Handle connect.challenge — server sends this immediately after TCP connect
    if (event.event === 'connect.challenge') {
      const payload = event.payload as ConnectChallengePayload;
      this.challengeNonce = payload.nonce;
      log.info('Received connect challenge, nonce:', payload.nonce?.slice(0, 8) + '...');

      // Auto-respond with connect request
      this.sendConnectRequest();
      return;
    }

    // Dispatch to registered event handlers
    const handlers = this.eventHandlers.get(event.event);
    if (handlers) {
      handlers.forEach((handler) => handler(event));
    }

    // Handle tick events (heartbeat)
    if (event.event === 'tick') {
      // Tick received — connection is alive
      this.lastPongTime = Date.now();
    }
  }

  private handleResponse(res: ResponseFrame): void {
    const pending = this.pendingRequests.get(res.id);
    if (!pending) {
      log.warn('Received response for unknown request:', res.id);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(res.id);

    if (res.ok) {
      pending.resolve(res.payload);
    } else {
      pending.reject(
        new Error(
          `RPC Error [${res.error?.code}]: ${res.error?.message}`,
        ),
      );
    }
  }

  /**
   * Send the connect request after receiving challenge
   */
  private sendConnectRequest(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.error('Cannot send connect: WebSocket not open');
      return;
    }

    const connectParams: ConnectParams = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: 'mobileclaw-ios',
        displayName: 'MobileClaw',
        version: '1.0.0',
        platform: 'ios',
        mode: 'operator',
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      auth: {
        token: this.token,
      },
      locale: 'zh-CN',
      userAgent: `mobileclaw/${'1.0.0'}`,
    };

    const frame: RequestFrame = {
      type: 'req',
      id: uuid(),
      method: 'connect',
      params: connectParams,
    };

    log.info('Sending connect request...');
    this.sendRaw(JSON.stringify(frame));
  }

  /**
   * Make an RPC call — sends a req frame and waits for matching res frame
   */
  async rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const id = uuid();

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
   * Send a raw string over the WebSocket
   */
  private sendRaw(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      log.warn('Cannot send: WebSocket not open');
    }
  }

  /**
   * Send an event frame (e.g., video_frame for real-time streaming)
   */
  sendEvent(eventName: string, payload?: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn('Cannot send event: WebSocket not open');
      return;
    }

    const frame: EventFrame = {
      type: 'event',
      event: eventName,
      payload,
    };
    this.sendRaw(JSON.stringify(frame));
  }

  // ─── Reconnection ───────────────────────────────────────────────

  private lastPongTime = 0;

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastPongTime = Date.now();

    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      // Check if we've received a recent tick/pong
      if (Date.now() - this.lastPongTime > HEARTBEAT_INTERVAL_MS * 2) {
        log.warn('No heartbeat response for 30s, closing connection');
        this.ws.close(4001, 'heartbeat_timeout');
        return;
      }

      // The tick is handled by the server; we just need to monitor it
      // If using a custom ping, uncomment below:
      // this.sendRaw(JSON.stringify({ type: 'ping', ts: Date.now() }));
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

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Connection closed: ${reason}`));
    }
    this.pendingRequests.clear();

    // Notify disconnect listeners
    this.disconnectListeners.forEach((handler) => handler(code, reason));

    // Don't reconnect on normal closure
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
      this.disconnectListeners.forEach((handler) =>
        handler(-1, 'Max reconnect attempts reached'),
      );
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.attempt),
      RECONNECT_MAX_DELAY_MS,
    ) * (0.5 + Math.random() * 0.5); // ±50% jitter

    this.attempt++;
    this.setStatus('reconnecting');
    log.info(
      `Reconnecting in ${Math.round(delay)}ms (attempt ${this.attempt}/${RECONNECT_MAX_ATTEMPTS})`,
    );

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
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    this.eventHandlers.get(eventName)!.add(handler);
    return () => this.eventHandlers.get(eventName)?.delete(handler);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  /**
   * Graceful disconnect
   */
  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.attempt = RECONNECT_MAX_ATTEMPTS; // Prevent auto-reconnect

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setStatus('disconnected');
    this.helloOkPayload = null;
    this.challengeNonce = null;
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    this.disconnect();
    this.statusListeners.clear();
    this.eventHandlers.clear();
    this.disconnectListeners.clear();
  }
}

// ─── Singleton ─────────────────────────────────────────────────────

export const gatewayClient = new GatewayClient();
