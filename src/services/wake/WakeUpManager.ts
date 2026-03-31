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
import { audioCaptureBridge } from '@/services/audio/AudioCaptureBridge';
import { cameraManager } from '@/services/camera/CameraManager';
import { FeishuPushService } from '@/services/history/FeishuPushService';
import { frameSender } from '@/services/camera/frameSender';
import { asrService } from '@/services/audio/ASRService';
import { ttsService } from '@/services/audio/TTSService';
import { gatewayClient } from '@/services/gateway/GatewayClient';
import { useAppStore } from '@/store/useAppStore';
import { useSessionStore } from '@/store/useSessionStore';
import { SecureStorage } from '@/services/storage/SecureStorage';
import { v4 as uuid } from 'uuid';
import { getLogger } from '@/utils/logger';
import { IDLE_TIMEOUT_MS } from '@/utils/constants';
import type { ActivationParams } from './UrlSchemeHandler';

const log = getLogger('WakeUpManager');

let idleTimer: ReturnType<typeof setTimeout> | null = null;

export class WakeUpManager {
  /**
   * Full activation sequence
   * @param params Optional activation parameters (e.g., from URL scheme)
   */
  async activate(params?: ActivationParams): Promise<void> {
    const appStore = useAppStore.getState();
    const sessionStore = useSessionStore.getState();

    // If a specific gateway ID was requested, try to activate it
    if (params?.gatewayId) {
      const gw = appStore.config.gateways.find((g) => g.id === params.gatewayId);
      if (gw) {
        appStore.setActiveGateway(gw);
      }
    }

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

      // 2b. Start mic recording (for waveform + future PCM streaming)
      await audioManager.startRecording();

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

      // 6. Bind services to gateway + start video stream
      frameSender.bindGateway(gatewayClient);
      ttsService.bindGateway(gatewayClient);
      // Strategy B: Start continuous video_frame event stream (5fps default)
      frameSender.startContinuousStream();

      // 7. Start ASR (load credentials from secure storage)
      const asrConfig = { ...appStore.config.asr };
      if (asrConfig.type === 'doubao') {
        const [appId, accessToken] = await Promise.all([
          SecureStorage.getASRAppId(),
          SecureStorage.getASRAccessToken(),
        ]);
        if (appId) asrConfig.appId = appId;
        if (accessToken) asrConfig.accessToken = accessToken;
      }
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

      // 7c. Initialize TTS service
      const ttsConfig = appStore.config.tts;
      await ttsService.initialize(ttsConfig);
      log.info('TTS initialized with path:', ttsConfig.type);

      // 7b. Start PCM audio capture bridge (feeds real-time audio to ASR)
      try {
        await audioCaptureBridge.startCapture();
      } catch (err) {
        log.warn('Audio capture bridge failed (non-critical, ASR may not receive audio):', err);
      }

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

    // Push conversation history to Feishu before teardown
    await this.pushToFeishu();

    // Graceful shutdown order matters!
    // 0. Stop PCM capture bridge (stops feeding ASR)
    await audioCaptureBridge.stopCapture();

    // 1. Stop mic recording (waveform visualization)
    await audioManager.stopRecording();

    // 2. Stop ASR
    await asrService.stopListening();
    useSessionStore.getState().setIsMicActive(false);

    // 2b. Stop any TTS playback (half-duplex: resume ASR after)
    await ttsService.stop();

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
   * Send user message (ASR transcript + optional image) to openclaw.
   *
   * Uses chat.send (not 'send' which is for channel messages like WhatsApp/SMS).
   * Strategy A: Attaches latest camera frame as an image attachment when available.
   */
  private async sendUserMessage(transcript: string): Promise<void> {
    const sessionStore = useSessionStore.getState();

    try {
      // Strategy A: Build attachments array with latest frame (if fresh)
      const attachments: Array<Record<string, unknown>> = [];
      const frameAttachment = frameSender.getLatestFrameAttachment();
      if (frameAttachment && sessionStore.isCameraActive && frameSender.hasFreshFrame()) {
        attachments.push(frameAttachment);
        log.info('Attaching camera frame to chat.send (Strategy A)');
      }

      const reply = await gatewayClient.chatSend(transcript, { attachments: attachments.length > 0 ? attachments : undefined });

      if (reply) {
        // Extract text content from reply
        const replyText = typeof reply === 'string' ? reply : JSON.stringify(reply);

        // Add AI response to chat history
        sessionStore.addMessage({
          id: uuid(),
          role: 'assistant',
          content: replyText,
          timestamp: Date.now(),
          hasVideoContext: attachments.length > 0,
        });

        // Auto-play TTS response (half-duplex: pauses ASR while speaking)
        try {
          await ttsService.speak(replyText, {
            onStart: () => log.info('TTS started for AI response'),
            onDone: () => log.info('TTS finished'),
            onError: (err) => log.warn('TTS playback failed (non-critical):', err),
          });
        } catch (ttsErr) {
          // TTS failure should not break the conversation flow
          log.warn('TTS error (non-critical):', ttsErr);
        }
      }
    } catch (error) {
      log.error('Failed to send message:', error);
    }
  }

  /**
   * Push completed conversation turn to Feishu/Lark.
   * Called during deactivate() before teardown.
   */
  private async pushToFeishu(): Promise<void> {
    const sessionStore = useSessionStore.getState();
    const { messages, sessionId, sessionStartTime } = sessionStore;

    if (!sessionId || messages.length === 0) return;

    // Find the last user message and AI response pair
    let lastUserMsg = messages.filter((m) => m.role === 'user').pop();
    let lastAiMsg = messages.filter((m) => m.role === 'assistant').pop();

    if (!lastUserMsg || !lastAiMsg) return;

    const durationMs = sessionStartTime ? Date.now() - sessionStartTime : 0;

    try {
      await FeishuPushService.pushTurn(
        '🦞 MobileClaw',
        lastUserMsg,
        lastAiMsg,
        { sessionId, durationMs },
      );
      log.info('Feishu push sent successfully');
    } catch (err) {
      log.warn('Feishu push failed (non-critical):', err);
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
