import { create } from 'zustand';
import type {
  SessionMode,
  ConnectionStatus,
  ChatMessage,
  VisionMode,
  VisionIntentStatus,
} from '@/types/session';
import { generateUUID } from '@/utils/rnCompat';

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
  cameraPreviewVisible: boolean;
  setIsCameraActive: (v: boolean) => void;
  setIsMicActive: (v: boolean) => void;
  setCameraPreviewVisible: (v: boolean) => void;

  // Vision
  visionMode: VisionMode;
  setVisionMode: (mode: VisionMode) => void;
  visionIntent: VisionIntentStatus;
  setVisionIntent: (status: VisionIntentStatus) => void;
  isAnalyzingVision: boolean;
  setIsAnalyzingVision: (v: boolean) => void;
  selectedFrameCount: number;
  setSelectedFrameCount: (count: number) => void;
  speechStartAt: number | null;
  speechEndAt: number | null;
  markSpeechStart: (timestamp?: number) => void;
  markSpeechEnd: (timestamp?: number) => void;
  resetSpeechWindow: () => void;

  // Conversation
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
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
  cameraPreviewVisible: false,
  setIsCameraActive: (v) => set({ isCameraActive: v }),
  setIsMicActive: (v) => set({ isMicActive: v }),
  setCameraPreviewVisible: (v) => set({ cameraPreviewVisible: v }),

  visionMode: 'auto',
  setVisionMode: (visionMode) => set({ visionMode }),
  visionIntent: 'unknown',
  setVisionIntent: (visionIntent) => set({ visionIntent }),
  isAnalyzingVision: false,
  setIsAnalyzingVision: (isAnalyzingVision) => set({ isAnalyzingVision }),
  selectedFrameCount: 0,
  setSelectedFrameCount: (selectedFrameCount) => set({ selectedFrameCount }),
  speechStartAt: null,
  speechEndAt: null,
  markSpeechStart: (timestamp = Date.now()) => set({ speechStartAt: timestamp }),
  markSpeechEnd: (timestamp = Date.now()) => set({ speechEndAt: timestamp }),
  resetSpeechWindow: () => set({ speechStartAt: null, speechEndAt: null }),

  messages: [],
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...patch } : msg,
      ),
    })),
  clearMessages: () => set({ messages: [] }),

  currentTranscript: '',
  setCurrentTranscript: (text) => set({ currentTranscript: text }),
  appendToTranscript: (text) =>
    set((state) => ({ currentTranscript: state.currentTranscript + text })),
  commitTranscript: () => {
    const { currentTranscript } = get();
    if (!currentTranscript.trim()) return;

    const userMsg: ChatMessage = {
      id: generateUUID(),
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
      sessionId: generateUUID(),
      gatewayId,
      mode: 'waking',
      connectionStatus: 'connecting',
      messages: [],
      currentTranscript: '',
      aiResponseText: '',
      isTTSSpeaking: false,
      visionIntent: 'unknown',
      isAnalyzingVision: false,
      selectedFrameCount: 0,
      speechStartAt: null,
      speechEndAt: null,
      framesSentCount: 0,
      sessionStartTime: Date.now(),
      lastActivityAt: Date.now(),
    }),

  endSession: () =>
    set({
      mode: 'idle',
      isCameraActive: false,
      isMicActive: false,
      cameraPreviewVisible: false,
      connectionStatus: 'disconnected',
      visionIntent: 'unknown',
      isAnalyzingVision: false,
      selectedFrameCount: 0,
      speechStartAt: null,
      speechEndAt: null,
    }),

  resetSession: () =>
    set({
      sessionId: null,
      gatewayId: null,
      mode: 'idle',
      connectionStatus: 'disconnected',
      isCameraActive: false,
      isMicActive: false,
      cameraPreviewVisible: false,
      messages: [],
      currentTranscript: '',
      aiResponseText: '',
      isTTSSpeaking: false,
      visionMode: 'auto',
      visionIntent: 'unknown',
      isAnalyzingVision: false,
      selectedFrameCount: 0,
      speechStartAt: null,
      speechEndAt: null,
      framesSentCount: 0,
      sessionStartTime: null,
      lastActivityAt: 0,
    }),
}));
