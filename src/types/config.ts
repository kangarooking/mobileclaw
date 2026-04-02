/**
 * MobileClaw Configuration Types
 */

// ─── OpenClaw Gateway Instance ───────────────────────────────────────

export interface GatewayConfig {
  id: string;
  name: string;                    // Display name, e.g., "Home", "Work"
  wsUrl: string;                   // e.g., "ws://192.168.1.100:18789"
  description?: string;
  isActive: boolean;
  avatarEmoji?: string;            // For quick visual identification
  // Token is stored separately in SecureStorage, referenced by id
}

// ─── ASR Provider Configuration ──────────────────────────────────────

export type ASRProviderType = 'doubao' | 'custom';

export interface ASRProviderConfig {
  type: ASRProviderType;
  /** 豆包 AppID（火山引擎控制台创建应用获得） */
  appId?: string;                  // Stored in SecureStorage
  /** 豆包 Access Token */
  accessToken?: string;            // Stored in SecureStorage
  /** 豆包 Secret Key（用于签名，部分模式需要） */
  secretKey?: string;             // Stored in SecureStorage
  endpoint?: string;               // Custom endpoint URL
  language: string;                // e.g., 'zh-CN', 'en-US'
  model?: string;
  options?: Record<string, unknown>;
}

// ─── TTS Provider Configuration ──────────────────────────────────────

export type TTSProviderType = 'openclaw' | 'edge' | 'doubao' | 'custom';

export interface TTSProviderConfig {
  type: TTSProviderType;
  apiKey?: string;                 // Stored in SecureStorage (legacy / non-Doubao providers)
  appId?: string;                 // Volcengine App ID (Doubao TTS)
  accessToken?: string;           // Volcengine Access Token (Doubao TTS)
  secretKey?: string;             // Volcengine Secret Key (optional for future/native flows)
  endpoint?: string;
  address?: string;               // e.g. wss://openspeech.bytedance.com
  uri?: string;                   // e.g. /api/v3/tts/bidirection
  cluster?: string;               // Legacy field from old Doubao TTS path
  resourceId?: string;            // BiTTS 2.0 source/resource id, e.g. seed-tts-2.0
  voiceId?: string;               // Optional instance/display name
  voiceType?: string;             // BiTTS 2.0 speaker
  language: string;
  speed?: number;                  // 0.5 - 2.0
  options?: Record<string, unknown>;
}

// ─── Feishu/Lark Integration ─────────────────────────────────────────

export interface FeishuConfig {
  enabled: boolean;
  webhookUrl: string;
  secret?: string;
  channelName?: string;
}

// ─── Video Settings ──────────────────────────────────────────────────

export type VideoResolution = '640x480' | '1280x720';

export interface VideoConfig {
  resolution: VideoResolution;
  fps: number;
  jpegQuality: number;             // 0.3 - 1.0
  visionMode: 'auto' | 'off' | 'force';
  speechFrameMaxCount: number;
  replyTimeoutMs: number;
  bufferWindowMs: number;
  preRollMs: number;
  postRollMs: number;
  bufferFps: number;
}

// ─── Top-Level App Configuration ─────────────────────────────────────

export interface AppConfig {
  gateways: GatewayConfig[];
  activeGatewayId: string | null;
  asr: ASRProviderConfig;
  tts: TTSProviderConfig;
  feishu: FeishuConfig;
  wakeWord: string;
  video: VideoConfig;
  advanced: {
    debugMode: boolean;
    idleTimeoutSeconds: number;
    autoReconnect: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  gateways: [],
  activeGatewayId: null,
  asr: {
    type: 'doubao',
    language: 'zh-CN',
  },
  tts: {
    type: 'doubao',
    address: 'wss://openspeech.bytedance.com',
    uri: '/api/v3/tts/bidirection',
    resourceId: 'seed-tts-2.0',
    voiceId: 'TTS-SeedTTS2.02000000687609518146',
    voiceType: 'zh_female_vv_uranus_bigtts',
    language: 'zh-CN',
    speed: 1.0,
  },
  feishu: {
    enabled: false,
    webhookUrl: '',
  },
  wakeWord: '小爪',
  video: {
    resolution: '640x480',
    fps: 15,
    jpegQuality: 0.7,
    visionMode: 'auto',
    speechFrameMaxCount: 7,
    replyTimeoutMs: 90_000,
    bufferWindowMs: 4_000,
    preRollMs: 500,
    postRollMs: 300,
    bufferFps: 4,
  },
  advanced: {
    debugMode: false,
    idleTimeoutSeconds: 30,
    autoReconnect: true,
    logLevel: 'warn',
  },
};
