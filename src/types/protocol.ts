/**
 * OpenClaw Gateway WebSocket Protocol Types
 *
 * Based on: /Users/kangarooking/Desktop/mygGit/openclaw/docs/gateway/protocol.md
 * Schema source: src/gateway/protocol/schema/frames.ts
 * Protocol version: 3
 */

// ─── Frame Discriminator Union ──────────────────────────────────────

export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame;

// ─── Request Frame (Client → Server) ────────────────────────────────

export interface RequestFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

// ─── Response Frame (Server → Client) ────────────────────────────────

export interface ErrorShape {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
}

export interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: ErrorShape;
}

// ─── Event Frame (Server → Client, push) ─────────────────────────────

export interface EventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
}

// ─── Connect Handshake ───────────────────────────────────────────────

export interface ConnectChallengePayload {
  nonce: string;
  ts: number;
}

export interface ClientInfo {
  id: string;           // e.g., "mobileclaw-ios"
  displayName?: string;
  version: string;      // e.g., "1.0.0"
  platform: string;     // "ios" | "android" | "macos"
  deviceFamily?: string;
  mode: 'operator' | 'node';
  instanceId?: string;
}

export interface DeviceIdentity {
  id: string;           // fingerprint-derived from public key
  publicKey: string;    // base64-url-encoded
  signature: string;
  signedAt: number;
  nonce: string;        // must match challenge nonce
}

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: ClientInfo;
  role: 'operator' | 'node';
  scopes?: string[];
  caps?: string[];       // for node role: ["camera", "voice", ...]
  commands?: string[];
  permissions?: Record<string, boolean>;
  auth: AuthParams;
  locale?: string;
  userAgent?: string;
  device?: DeviceIdentity;
}

export interface AuthParams {
  token?: string;
  deviceToken?: string;
  password?: string;
}

// ─── Hello-OK Response ───────────────────────────────────────────────

export interface ServerInfo {
  version: string;
  connId: string;
}

export interface FeatureList {
  methods: string[];
  events: string[];
}

export interface HelloOkPayload {
  type: 'hello-ok';
  protocol: number;
  server: ServerInfo;
  features: FeatureList;
  snapshot?: unknown;
  canvasHostUrl?: string;
  auth?: {
    deviceToken: string;
    role: string;
    scopes: string[];
    issuedAtMs?: number;
  };
  policy: {
    maxPayload: number;
    maxBufferedBytes: number;
    tickIntervalMs: number;
  };
}

// ─── RPC Method Payloads (commonly used) ─────────────────────────────

/** send — Send a message to the agent */
export interface SendParams {
  message: string;
  image?: string;        // base64 JPEG
  sessionKey?: string;
}

/** tts.convert — Convert text to speech */
export interface TTSConvertParams {
  text: string;
  voiceId?: string;
  outputFormat?: string;
}

/** chat.send — WebChat-native send */
export interface ChatSendParams {
  message: string;
  sessionKey?: string;
}
