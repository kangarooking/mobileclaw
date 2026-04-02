/**
 * Type declarations for HeaderWebSocket native iOS module
 * Provides WebSocket connections with custom HTTP headers (for ByteDance ASR auth)
 */

declare module 'NativeModules' {
  interface NativeModulesStatic {
    HeaderWebSocket: {
      // Connect to WebSocket URL with custom HTTP headers
      connect(url: string, headers: Record<string, string>): Promise<boolean>;
      // Send binary data (byte array) over WebSocket
      sendData(data: number[]): Promise<boolean>;
      // Start streaming 16kHz mono PCM microphone audio
      startAudioCapture(): Promise<boolean>;
      // Stop microphone PCM capture
      stopAudioCapture(): Promise<boolean>;
      // Return current native audio capture/session state for debugging
      getAudioCaptureDebugInfo(): Promise<Record<string, unknown>>;
      // Initialize / drive native Doubao BiTTS 2.0
      initializeDoubaoTTS(config: Record<string, unknown>): Promise<boolean>;
      speakDoubaoTTS(text: string): Promise<boolean>;
      stopDoubaoTTS(): Promise<boolean>;
      destroyDoubaoTTS(): Promise<boolean>;
      // Close WebSocket connection
      close(): Promise<boolean>;
    };
  }
}

// Event emitter for HeaderWebSocket events
declare module 'NativeEventEmitter' {
  interface NativeEventEmitter {
    // HeaderWebSocket events
    addListener(event: 'HeaderWebSocket:onOpen'): EmitterSubscription;
    addListener(event: 'HeaderWebSocket:onMessage', callback: (data: { type: string; data: any }) => void): EmitterSubscription;
    addListener(event: 'HeaderWebSocket:onError', callback: (data: { code: number; message: string }) => void): EmitterSubscription;
    addListener(event: 'HeaderWebSocket:onClose', callback: (data: { code: number; reason: string }) => void): EmitterSubscription;
    addListener(event: 'HeaderWebSocket:onAudioData', callback: (data: { data: number[] }) => void): EmitterSubscription;
    addListener(event: 'HeaderWebSocket:onAudioCaptureError', callback: (data: { message: string }) => void): EmitterSubscription;
    addListener(event: 'HeaderWebSocket:onAudioCaptureStatus', callback: (data: Record<string, unknown>) => void): EmitterSubscription;
    addListener(event: 'HeaderWebSocket:onTTSStatus', callback: (data: Record<string, unknown>) => void): EmitterSubscription;
    addListener(event: 'HeaderWebSocket:onTTSError', callback: (data: { message: string; code?: number }) => void): EmitterSubscription;
  }
}
