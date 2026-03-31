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
  transcript?: string;            // Original ASR text (for user messages)
  audioDurationMs?: number;
}

// ─── Session Mode ────────────────────────────────────────────────────

export type SessionMode = 'idle' | 'waking' | 'active';

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
