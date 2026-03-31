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
  apiKey?: string;                 // Stored in SecureStorage
  endpoint?: string;               // Custom endpoint URL
  language: string;                // e.g., 'zh-CN', 'en-US'
  model?: string;
  options?: Record<string, unknown>;
}

// ─── TTS Provider Configuration ──────────────────────────────────────

export type TTSProviderType = 'openclaw' | 'edge' | 'doubao' | 'custom';

export interface TTSProviderConfig {
  type: TTSProviderType;
  apiKey?: string;                 // Stored in SecureStorage
  endpoint?: string;
  voiceId?: string;
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
    type: 'edge',                  // Default to free Edge TTS
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
  },
  advanced: {
    debugMode: false,
    idleTimeoutSeconds: 30,
    autoReconnect: true,
    logLevel: 'warn',
  },
};
