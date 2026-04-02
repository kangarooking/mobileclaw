/**
 * Session & Conversation State Types
 */

// ─── Chat Message ────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  hasVideoContext: boolean;
  visionIntent?: 'unknown' | 'needed' | 'skipped';
  visionFrameCount?: number;
  transcript?: string;            // Original ASR text (for user messages)
  audioDurationMs?: number;
}

// ─── Session Mode ────────────────────────────────────────────────────

export type SessionMode = 'idle' | 'waking' | 'active';

export type VisionMode = 'auto' | 'off' | 'force';
export type VisionIntentStatus = 'unknown' | 'needed' | 'skipped';

// ─── Connection Status ───────────────────────────────────────────────

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

// ─── Full Session State ──────────────────────────────────────────────

export interface SessionState {
  sessionId: string | null;
  gatewayId: string | null;

  // Connection
  connectionStatus: ConnectionStatus;

  // Mode
  mode: SessionMode;

  // Media streams
  isCameraActive: boolean;
  isMicActive: boolean;
  cameraPreviewVisible: boolean;

  // Vision
  visionMode: VisionMode;
  visionIntent: VisionIntentStatus;
  isAnalyzingVision: boolean;
  selectedFrameCount: number;
  speechStartAt: number | null;
  speechEndAt: number | null;

  // Conversation
  messages: ChatMessage[];
  currentTranscript: string;      // Live ASR text being built up

  // AI response
  aiResponseText: string;
  isTTSSpeaking: boolean;

  // Stats
  framesSentCount: number;
  sessionStartTime: number | null;
  lastActivityAt: number;
}
