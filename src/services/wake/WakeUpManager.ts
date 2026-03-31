/**
 * WakeUpManager — Voice wake-up orchestration
 *
 * Coordinates the full activation sequence when the user wakes up MobileClaw:
 *  1. Configure audio session
 *  2. Start camera preview + mic input simultaneously
 *  3. Connect to openclaw gateway via WebSocket
 *  4. Begin streaming video frames + listening for ASR
 */

import { audioManager } from '@/services/audio/AudioManager';
import { cameraManager } from '@/services/camera/CameraManager';
import { frameSender } from '@/services/camera/frameSender';
import { asrService } from '@/services/audio/ASRService';
import { gatewayClient } from '@/services/gateway/GatewayClient';
import { useAppStore } from '@/store/useAppStore';
import { useSessionStore } from '@/store/useSessionStore';
import { SecureStorage } from '@/services/storage/SecureStorage';
import { getLogger } from '@/utils/logger';
import { IDLE_TIMEOUT_MS } from '@/utils/constants';

const log = getLogger('WakeUpManager');

let idleTimer: ReturnType<typeof setTimeout> | null = null;

export class WakeUpManager {
  /**
   * Full activation sequence
   */
  async activate(): Promise<void> {
    const appStore = useAppStore.getState();
    const sessionStore = useSessionStore.getState();

    const gateway = appStore.activeGateway;
    if (!gateway) {
      log.error('No active gateway configured');
      throw new Error('No active gateway. Please configure one in Settings.');
    }

    log.info('🦞 Activating MobileClaw...');

    try {
      // 1. Start session state
      sessionStore.startSession(gateway.id);

      // 2. Configure audio session (simultaneous record + play)
      await audioManager.configureSession();

      // 3. Initialize camera
      await cameraManager.initialize();
      sessionStore.setIsCameraActive(true);

      // 4. Get gateway token from secure storage
      const token = await SecureStorage.getGatewayToken(gateway.id);
      if (!token) {
        throw new Error(`No auth token found for gateway: ${gateway.name}`);
      }

      // 5. Connect to openclaw gateway
      const helloOk = await gatewayClient.connect(gateway.wsUrl, token);
      log.info('Connected to gateway:', helloOk.server.version);

      // 6. Bind services to gateway
      frameSender.bindGateway(gatewayClient);

      // 7. Start ASR
      const asrConfig = appStore.config.asr;
      await asrService.initialize(asrConfig);
      await asrService.startListening({
        onInterim: (text) => {
          sessionStore.setCurrentTranscript(text);
          sessionStore.touchActivity();
        },
        onFinal: (text) => {
          sessionStore.appendToTranscript(text + ' ');
          sessionStore.touchActivity();
          // Auto-send final transcript to openclaw
          this.sendUserMessage(text);
        },
        onError: (err) => log.error('ASR error:', err),
      });
      sessionStore.setIsMicActive(true);

      // 8. Set mode to active
      sessionStore.setMode('active');
      log.info('✅ MobileClaw fully activated!');

      // 9. Start idle timeout monitor
      this.startIdleMonitor();

    } catch (error) {
      log.error('Activation failed:', error);
      sessionStore.endSession();
      throw error;
    }
  }

  /**
   * Deactivate / return to idle
   */
  async deactivate(): Promise<void> {
    log.info('Deactivating MobileClaw...');

    this.stopIdleMonitor();

    // Graceful shutdown order matters!
    // 1. Stop ASR first
    await asrService.stopListening();
    useSessionStore.getState().setIsMicActive(false);

    // 2. Stop any TTS playback
    // (handled by TTSService.stop())

    // 3. Stop camera
    useSessionStore.getState().setIsCameraActive(false);

    // 4. Stop continuous video stream
    frameSender.stopContinuousStream();

    // 5. Disconnect WebSocket last
    gatewayClient.disconnect();

    // 6. Reset session mode
    useSessionStore.getState().endSession();

    log.info('MobileClaw deactivated. Back to idle.');
  }

  /**
   * Send user message (ASR transcript + optional image) to openclaw
   */
  private async sendUserMessage(transcript: string): Promise<void> {
    const sessionStore = useSessionStore.getState();
    const latestFrame = cameraManager.latestFrame;

    try {
      const payload: Record<string, unknown> = {
        message: transcript,
      };

      // Attach latest camera frame if available
      if (latestFrame && sessionStore.isCameraActive) {
        payload.image = latestFrame;
      }

      const reply = await gatewayClient.rpc<{ payload: string }>('send', payload);

      if (reply?.payload) {
        // Add AI response to chat history
        sessionStore.addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: typeof reply.payload === 'string' ? reply.payload : JSON.stringify(reply.payload),
          timestamp: Date.now(),
          hasVideoContext: !!latestFrame,
        });

        // Play TTS response
        // (TTS playback will be triggered by the UI layer observing the message)
      }
    } catch (error) {
      log.error('Failed to send message:', error);
    }
  }

  /**
   * Start auto-deactivate timer after period of inactivity
   */
  private startIdleMonitor(): void {
    this.stopIdleMonitor();

    idleTimer = setInterval(() => {
      const sessionStore = useSessionStore.getState();
      if (sessionStore.mode !== 'active') return;

      const idleTime = Date.now() - sessionStore.lastActivityAt;
      if (idleTime > IDLE_TIMEOUT_MS) {
        log.info(`Idle for ${Math.round(idleTime / 1000)}s, auto-deactivating`);
        this.deactivate();
      }
    }, 5000); // Check every 5 seconds
  }

  private stopIdleMonitor(): void {
    if (idleTimer) {
      clearInterval(idleTimer);
      idleTimer = null;
    }
  }
}

export const wakeUpManager = new WakeUpManager();
