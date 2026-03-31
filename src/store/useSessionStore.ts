import { create } from 'zustand';
import type {
  SessionMode,
  ConnectionStatus,
  ChatMessage,
} from '@/types/session';
import { v4 as uuid } from 'uuid';

interface SessionStateStore {
  // Session identity
  sessionId: string | null;
  gatewayId: string | null;

  // Connection
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

  // Mode
  mode: SessionMode;
  setMode: (mode: SessionMode) => void;

  // Media streams
  isCameraActive: boolean;
  isMicActive: boolean;
  setIsCameraActive: (v: boolean) => void;
  setIsMicActive: (v: boolean) => void;

  // Conversation
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;

  currentTranscript: string;
  setCurrentTranscript: (text: string) => void;
  appendToTranscript: (text: string) => void;
  commitTranscript: () => void;   // Finalize ASR text into a user message

  // AI response
  aiResponseText: string;
  setAIResponseText: (text: string) => void;
  appendAIResponse: (text: string) => void;
  isTTSSpeaking: boolean;
  setIsTTSSpeaking: (v: boolean) => void;

  // Stats
  framesSentCount: number;
  incrementFramesSent: () => void;
  sessionStartTime: number | null;
  lastActivityAt: number;
  touchActivity: () => void;

  // Lifecycle
  startSession: (gatewayId: string) => void;
  endSession: () => void;
  resetSession: () => void;
}

export const useSessionStore = create<SessionStateStore>((set, get) => ({
  sessionId: null,
  gatewayId: null,

  connectionStatus: 'disconnected',
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  mode: 'idle',
  setMode: (mode) => set({ mode }),

  isCameraActive: false,
  isMicActive: false,
  setIsCameraActive: (v) => set({ isCameraActive: v }),
  setIsMicActive: (v) => set({ isMicActive: v }),

  messages: [],
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [] }),

  currentTranscript: '',
  setCurrentTranscript: (text) => set({ currentTranscript: text }),
  appendToTranscript: (text) =>
    set((state) => ({ currentTranscript: state.currentTranscript + text })),
  commitTranscript: () => {
    const { currentTranscript } = get();
    if (!currentTranscript.trim()) return;

    const userMsg: ChatMessage = {
      id: uuid(),
      role: 'user',
      content: currentTranscript.trim(),
      timestamp: Date.now(),
      hasVideoContext: get().isCameraActive,
      transcript: currentTranscript.trim(),
    };

    set((state) => ({
      messages: [...state.messages, userMsg],
      currentTranscript: '',
      lastActivityAt: Date.now(),
    }));
  },

  aiResponseText: '',
  setAIResponseText: (text) => set({ aiResponseText: text }),
  appendAIResponse: (text) =>
    set((state) => ({ aiResponseText: state.aiResponseText + text })),
  isTTSSpeaking: false,
  setIsTTSSpeaking: (v) => set({ isTTSSpeaking: v }),

  framesSentCount: 0,
  incrementFramesSent: () =>
    set((state) => ({ framesSentCount: state.framesSentCount + 1 })),
  sessionStartTime: null,
  lastActivityAt: 0,
  touchActivity: () => set({ lastActivityAt: Date.now() }),

  startSession: (gatewayId) =>
    set({
      sessionId: uuid(),
      gatewayId,
      mode: 'waking',
      connectionStatus: 'connecting',
      messages: [],
      currentTranscript: '',
      aiResponseText: '',
      isTTSSpeaking: false,
      framesSentCount: 0,
      sessionStartTime: Date.now(),
      lastActivityAt: Date.now(),
    }),

  endSession: () =>
    set({
      mode: 'idle',
      isCameraActive: false,
      isMicActive: false,
      connectionStatus: 'disconnected',
    }),

  resetSession: () =>
    set({
      sessionId: null,
      gatewayId: null,
      mode: 'idle',
      connectionStatus: 'disconnected',
      isCameraActive: false,
      isMicActive: false,
      messages: [],
      currentTranscript: '',
      aiResponseText: '',
      isTTSSpeaking: false,
      framesSentCount: 0,
      sessionStartTime: null,
      lastActivityAt: 0,
    }),
}));
