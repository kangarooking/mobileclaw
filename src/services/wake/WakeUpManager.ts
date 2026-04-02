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
import { visualFrameBuffer } from '@/services/camera/VisualFrameBuffer';
import { asrService } from '@/services/audio/ASRService';
import { ttsService } from '@/services/audio/TTSService';
import { gatewayClient } from '@/services/gateway/GatewayClient';
import { speechVisualSession } from '@/services/vision/SpeechVisualSession';
import { visionIntentService } from '@/services/vision/VisionIntentService';
import { visualContextSelector } from '@/services/vision/VisualContextSelector';
import { useAppStore } from '@/store/useAppStore';
import { useSessionStore } from '@/store/useSessionStore';
import { SecureStorage } from '@/services/storage/SecureStorage';
import { DEFAULT_CONFIG } from '@/types/config';
import { generateUUID } from '@/utils/rnCompat';
import { getLogger } from '@/utils/logger';
import type { ActivationParams } from './UrlSchemeHandler';

const log = getLogger('WakeUpManager');
const SPEECH_SUBMIT_SILENCE_MS = 3000;
const DEFAULT_CHAT_SESSION_KEY = 'main:webchat:mobileclaw';
const HISTORY_POLL_INTERVAL_MS = 2500;

let idleTimer: ReturnType<typeof setTimeout> | null = null;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class WakeUpManager {
  private speechSubmitTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFinalTranscript = '';
  private latestInterimTranscript = '';
  private lastUserMessageId: string | null = null;
  private lastAcceptedFinalKey = '';
  private lastAcceptedFinalAt = 0;

  /**
   * Full activation sequence
   * @param params Optional activation parameters (e.g., from URL scheme)
   * @param options Camera toggle — default false (voice-only mode)
   */
  async activate(params?: ActivationParams, options?: { useCamera: boolean }): Promise<void> {
    const useCamera = options?.useCamera ?? false;
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
    this.resetSpeechAggregation();

    // Import Alert for visible step reporting
    const { Alert } = require('react-native');

    const step = (n: string, msg: string) => {
      log.info(`[Step ${n}] ${msg}`);
    };

    try {
      // 1. Start session state
      step('1/8', 'Starting session...');
      sessionStore.startSession(gateway.id);

      // 2. Configure audio session
      step('2/8', 'Configuring audio...');
      try { await audioManager.configureSession(); } catch(e) { Alert.alert('步骤2失败', String(e)); }

      // 3. Start mic recording
      step('3/8', 'Starting mic...');
      try {
        await audioManager.ensureMicrophonePermission();
        step('3/8', '✅ Mic permission');
      } catch(e: any) {
        const msg = e?.message || String(e);
        if (msg.includes('permission') || msg.includes('Permission')) {
          Alert.alert('🎤 麦克风权限被拒', '请到 iPhone 设置 → 隐私 → 麦克风 中允许 MobileClaw 访问，然后重新点击 Tap to Talk。\n\n错误: ' + msg);
        } else {
          Alert.alert('录音启动失败', msg);
        }
        throw e;
      }

      // 4. Camera (optional)
      if (useCamera) {
        step('4/8', 'Init camera...');
        try {
          await cameraManager.initialize();
          visualFrameBuffer.configure({
            maxWindowMs: appStore.config.video.bufferWindowMs,
            maxFrames: Math.max(
              appStore.config.video.speechFrameMaxCount * 6,
              appStore.config.video.bufferFps * 4,
            ),
          });
          sessionStore.setIsCameraActive(true);
          sessionStore.setCameraPreviewVisible(true);
          sessionStore.setVisionMode(appStore.config.video.visionMode);
        } catch(e) {}
      }

      // 5. Load gateway token
      step('5/8', 'Loading token...');
      const token = await SecureStorage.getGatewayToken(gateway.id);
      if (!token) {
        Alert.alert('配置缺失', `没有找到网关 "${gateway.name}" 的认证Token，请去设置页重新添加`);
        throw new Error(`No token for ${gateway.name}`);
      }
      step('5/8', `Token OK (${token.length} chars)`);

      // 6. Load / bind device identity for scoped gateway access
      step('6/8', 'Preparing device identity...');
      try {
        const { DeviceIdentityService } = await import('@/services/gateway/DeviceIdentityService');
        const identity = await DeviceIdentityService.getOrCreateIdentity();
        gatewayClient.setDeviceIdentity(identity);
        step('6/8', '✅ Device identity ready');
      } catch (e) {
        Alert.alert('设备身份初始化失败', getErrorMessage(e));
        throw e;
      }

      // 7. Connect to openclaw gateway
      step('7/8', `Connecting to ${gateway.wsUrl}...`);
      let helloOk: any;
      try {
        helloOk = await gatewayClient.connect(gateway.wsUrl, token);
        step('7/8', `✅ Gateway connected!`);
      } catch(e) {
        Alert.alert('Gateway连接失败', `${getErrorMessage(e)}\n\n检查openclaw是否在运行 (${gateway.wsUrl})`);
        throw e;
      }

      // 8. Bind services
      step('8/8', 'Binding services...');
      frameSender.bindGateway(gatewayClient);
      ttsService.bindGateway(gatewayClient);

      // 9. Start ASR (non-critical — won't block activation)
      step('9/9', 'Starting ASR...');
      try {
        const asrConfig = { ...appStore.config.asr };
        if (asrConfig.type === 'doubao') {
          const [appId, accessToken] = await Promise.all([
            SecureStorage.getASRAppId(),
            SecureStorage.getASRAccessToken(),
          ]);
          if (appId) asrConfig.appId = appId;
          if (accessToken) asrConfig.accessToken = accessToken;
          log.info('ASR creds: appId=', appId ?? '(none)', ', hasToken=', !!accessToken);
        }
        await asrService.initialize(asrConfig);
        await asrService.startListening({
          onInterim: (text) => {
            this.handleInterimTranscript(text);
            sessionStore.touchActivity();
          },
          onFinal: (text) => {
            this.handleFinalTranscript(text);
            sessionStore.touchActivity();
          },
          onError: (err) => log.warn('ASR runtime issue:', err),
        });
        sessionStore.setIsMicActive(true);
        step('9/9', '✅ ASR running');
      } catch(asrErr) {
        // ASR failure should NOT block the whole flow
        Alert.alert('ASR启动失败', `语音识别无法启动，但可以继续使用。\n\n${getErrorMessage(asrErr)}`);
        log.error('ASR failed (non-critical):', asrErr);
      }

      // 9. TTS (non-critical)
      try {
        const ttsConfig = { ...appStore.config.tts };
        if (ttsConfig.type === 'doubao') {
          const [ttsAppId, ttsAccessToken, ttsSecretKey, asrAppId, asrAccessToken] = await Promise.all([
            SecureStorage.getTTSAppId(),
            SecureStorage.getTTSAccessToken(),
            SecureStorage.getTTSSecretKey(),
            SecureStorage.getASRAppId(),
            SecureStorage.getASRAccessToken(),
          ]);

          ttsConfig.appId =
            ttsConfig.appId ||
            ttsAppId ||
            asrAppId ||
            DEFAULT_CONFIG.tts.appId;
          ttsConfig.accessToken =
            ttsConfig.accessToken ||
            ttsAccessToken ||
            asrAccessToken ||
            DEFAULT_CONFIG.tts.accessToken;
          ttsConfig.secretKey =
            ttsConfig.secretKey ||
            ttsSecretKey ||
            DEFAULT_CONFIG.tts.secretKey;

          log.info('TTS creds:', {
            type: ttsConfig.type,
            hasAppId: !!ttsConfig.appId,
            hasAccessToken: !!ttsConfig.accessToken,
            resourceId: ttsConfig.resourceId || '(missing)',
            instanceName: ttsConfig.voiceId || '(missing)',
            speaker: ttsConfig.voiceType || '(missing)',
          });
        }
        await ttsService.initialize(ttsConfig);
      } catch (ttsErr) {
        log.warn('TTS init failed (non-critical):', getErrorMessage(ttsErr));
      }

      // 10. PCM capture bridge (non-critical)
      try {
        await audioCaptureBridge.startCapture();
      } catch(bridgeErr) {
        log.warn('PCM bridge skipped:', getErrorMessage(bridgeErr));
        // Don't alert for this — it's expected to fail without proper native module
      }

      // 11. Activate!
      sessionStore.setMode('active');
      this.startIdleMonitor();
      log.info('✅✅✅ MobileClaw FULLY ACTIVATED!');

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

    this.clearSpeechSubmitTimer();
    this.resetSpeechAggregation();
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
    useSessionStore.getState().setCameraPreviewVisible(false);
    visualFrameBuffer.clear();
    speechVisualSession.reset();

    // 4. Stop continuous video stream
    frameSender.stopContinuousStream();

    // 5. Disconnect WebSocket last
    gatewayClient.disconnect();

    // 6. Reset session mode
    useSessionStore.getState().endSession();

    log.info('MobileClaw deactivated. Back to idle.');
  }

  private handleInterimTranscript(text: string): void {
    const sessionStore = useSessionStore.getState();
    if (text.trim()) {
      this.markSpeechStarted();
      sessionStore.setMode('active');
    }
    this.latestInterimTranscript = text.trim();
    sessionStore.setCurrentTranscript(this.composeLiveTranscript());
    this.scheduleSpeechSubmit();
  }

  private handleFinalTranscript(text: string): void {
    const normalized = text.trim();
    if (!normalized) return;
    const finalKey = this.makeTranscriptKey(normalized);
    const now = Date.now();
    if (
      finalKey &&
      finalKey === this.lastAcceptedFinalKey &&
      now - this.lastAcceptedFinalAt < 2500
    ) {
      log.info('Ignoring duplicated final transcript chunk:', normalized);
      this.latestInterimTranscript = '';
      useSessionStore.getState().setCurrentTranscript(this.composeLiveTranscript());
      this.scheduleSpeechSubmit();
      return;
    }

    this.markSpeechStarted();
    this.pendingFinalTranscript = [this.pendingFinalTranscript, normalized]
      .filter(Boolean)
      .join(' ')
      .trim();
    this.lastAcceptedFinalKey = finalKey;
    this.lastAcceptedFinalAt = now;
    this.latestInterimTranscript = '';
    useSessionStore.getState().setCurrentTranscript(this.composeLiveTranscript());
    this.scheduleSpeechSubmit();
  }

  private composeLiveTranscript(): string {
    return [this.pendingFinalTranscript, this.latestInterimTranscript]
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  private scheduleSpeechSubmit(): void {
    this.clearSpeechSubmitTimer();
    this.speechSubmitTimer = setTimeout(() => {
      void this.flushPendingTranscript();
    }, SPEECH_SUBMIT_SILENCE_MS);
  }

  private clearSpeechSubmitTimer(): void {
    if (!this.speechSubmitTimer) return;
    clearTimeout(this.speechSubmitTimer);
    this.speechSubmitTimer = null;
  }

  private resetSpeechAggregation(): void {
    this.clearSpeechSubmitTimer();
    this.pendingFinalTranscript = '';
    this.latestInterimTranscript = '';
    const sessionStore = useSessionStore.getState();
    sessionStore.setCurrentTranscript('');
    sessionStore.resetSpeechWindow();
    sessionStore.setVisionIntent('unknown');
    sessionStore.setSelectedFrameCount(0);
    sessionStore.setIsAnalyzingVision(false);
    this.lastUserMessageId = null;
    this.lastAcceptedFinalKey = '';
    this.lastAcceptedFinalAt = 0;
    speechVisualSession.reset();
  }

  private async flushPendingTranscript(): Promise<void> {
    this.clearSpeechSubmitTimer();

    const rawTranscript = this.collapseDuplicatedTranscript(this.composeLiveTranscript());
    const transcript = this.normalizeWakeCommand(rawTranscript);
    if (!transcript) {
      if (rawTranscript.trim()) {
        log.info('Ignoring transcript without wake-word prefix:', rawTranscript.trim());
        useSessionStore.getState().touchActivity();
      }
      this.resetSpeechAggregation();
      return;
    }

    const sessionStore = useSessionStore.getState();
    sessionStore.markSpeechEnd();
    const userMessageId = generateUUID();
    this.lastUserMessageId = userMessageId;
    sessionStore.addMessage({
      id: userMessageId,
      role: 'user',
      content: transcript,
      timestamp: Date.now(),
      hasVideoContext: false,
      visionIntent: 'unknown',
      transcript,
    });
    sessionStore.setCurrentTranscript('');
    sessionStore.touchActivity();

    this.pendingFinalTranscript = '';
    this.latestInterimTranscript = '';

    await this.sendUserMessage(transcript);
    sessionStore.resetSpeechWindow();
  }

  private normalizeWakeCommand(text: string): string {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (!collapsed) return '';

    const wakeWords = this.getAcceptedWakeWords();
    const wakeWordPattern = wakeWords
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');

    if (!wakeWordPattern) return '';

    const prefixOnly = new RegExp(`^(?:${wakeWordPattern})[，,\\s。！？!?]*$`, 'u');
    if (prefixOnly.test(collapsed)) {
      return '';
    }

    const prefix = new RegExp(`^(?:${wakeWordPattern})[，,\\s]*`, 'u');
    if (!prefix.test(collapsed)) {
      return '';
    }

    return collapsed.replace(prefix, '').trim();
  }

  private makeTranscriptKey(text: string): string {
    return text.replace(/[，,。！？!?、\s]/gu, '').trim();
  }

  private collapseDuplicatedTranscript(text: string): string {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (!collapsed) return '';

    const parts = collapsed
      .split(/(?<=[，,。！？!?])/u)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 2) {
      const [first, second] = parts;
      if (this.makeTranscriptKey(first) === this.makeTranscriptKey(second)) {
        return first;
      }
    }

    return collapsed;
  }

  private getAcceptedWakeWords(): string[] {
    const configuredWakeWords = (useAppStore.getState().config.wakeWord || '')
      .split(/[，,\n]/u)
      .map((word) => word.trim())
      .filter(Boolean);
    return Array.from(
      new Set(
        [...configuredWakeWords, '龙虾']
          .filter((word): word is string => typeof word === 'string' && word.length > 0),
      ),
    );
  }

  private markSpeechStarted(): void {
    const sessionStore = useSessionStore.getState();
    if (sessionStore.speechStartAt) return;
    const timestamp = Date.now();
    sessionStore.markSpeechStart(timestamp);
    speechVisualSession.beginSpeech(timestamp);
  }

  /**
   * Send user message (ASR transcript + optional image) to openclaw.
   *
   * Uses chat.send (not 'send' which is for channel messages like WhatsApp/SMS).
   * Strategy A: Attaches latest camera frame as an image attachment when available.
   */
  private async sendUserMessage(transcript: string): Promise<void> {
    const sessionStore = useSessionStore.getState();
    const appConfig = useAppStore.getState().config;

    try {
      sessionStore.setIsAnalyzingVision(true);
      const { attachments, hasVisualContext } = await this.buildVisualAttachments(transcript, sessionStore.visionMode);
      if (this.lastUserMessageId) {
        sessionStore.updateMessage(this.lastUserMessageId, {
          hasVideoContext: hasVisualContext,
          visionIntent: hasVisualContext ? 'needed' : 'skipped',
          visionFrameCount: attachments.length,
        });
      }

      const sendAck = await gatewayClient.chatSend(transcript, {
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      const runId = this.extractRunId(sendAck);
      const replyText = runId
        ? await this.waitForAssistantReply(runId, transcript, appConfig.video.replyTimeoutMs)
        : null;

      if (!replyText) {
        log.warn('chat.send acknowledged but no assistant text received', { runId });
        return;
      }

      sessionStore.addMessage({
        id: generateUUID(),
        role: 'assistant',
        content: replyText,
        timestamp: Date.now(),
        hasVideoContext: hasVisualContext,
        visionIntent: hasVisualContext ? 'needed' : 'skipped',
        visionFrameCount: attachments.length,
      });

      try {
        await ttsService.speak(replyText, {
          onStart: () => log.info('TTS started for AI response'),
          onDone: () => log.info('TTS finished'),
          onError: (err) => log.warn('TTS playback failed (non-critical):', err),
        });
      } catch (ttsErr) {
        log.warn('TTS error (non-critical):', ttsErr);
      }
    } catch (error) {
      log.error('Failed to send message:', error);
      if (this.lastUserMessageId) {
        sessionStore.updateMessage(this.lastUserMessageId, {
          hasVideoContext: false,
          visionIntent: 'skipped',
          visionFrameCount: 0,
        });
      }
    } finally {
      sessionStore.setIsAnalyzingVision(false);
      this.lastUserMessageId = null;
    }
  }

  private async buildVisualAttachments(
    transcript: string,
    visionMode: 'auto' | 'off' | 'force',
  ): Promise<{ attachments: Array<Record<string, unknown>>; hasVisualContext: boolean }> {
    const sessionStore = useSessionStore.getState();
    log.info(`Vision pipeline start: mode=${visionMode}, cameraActive=${sessionStore.isCameraActive}`);
    if (!sessionStore.isCameraActive) {
      log.info('Vision pipeline: camera inactive -> skip');
      sessionStore.setVisionIntent('skipped');
      sessionStore.setSelectedFrameCount(0);
      return { attachments: [], hasVisualContext: false };
    }

    const config = useAppStore.getState().config.video;
    const visionIntent = visionMode === 'force'
      ? { needsVision: true, type: 'describe_scene', confidence: 1, source: 'rule' as const, reason: 'vision forced by user mode' }
      : visionMode === 'off'
        ? { needsVision: false, type: 'none', confidence: 1, source: 'rule' as const, reason: 'vision disabled by user mode' }
        : await visionIntentService.classify(transcript);

    log.info('Vision pipeline: intent result', visionIntent);

    sessionStore.setVisionIntent(visionIntent.needsVision ? 'needed' : 'skipped');

    if (!visionIntent.needsVision) {
      log.info('Vision pipeline: intent decided no vision');
      sessionStore.setSelectedFrameCount(0);
      return { attachments: [], hasVisualContext: false };
    }

    const window =
      speechVisualSession.endSpeech(Date.now(), config.preRollMs, config.postRollMs) ??
      {
        speechStartAt: Date.now(),
        speechEndAt: Date.now(),
        preRollMs: config.preRollMs,
        postRollMs: config.postRollMs,
        frameWindowStartAt: Date.now() - config.preRollMs,
        frameWindowEndAt: Date.now() + config.postRollMs,
      };

    const candidates = visualFrameBuffer.getFramesBetween(
      window.frameWindowStartAt,
      window.frameWindowEndAt,
    );
    log.info(
      `Vision pipeline: frame window ${window.frameWindowStartAt}..${window.frameWindowEndAt}, candidates=${candidates.length}, bufferSize=${visualFrameBuffer.size()}`,
    );

    const selection = visualContextSelector.select(candidates, {
      maxFrames: config.speechFrameMaxCount,
      minGapMs: Math.round(1000 / Math.max(config.bufferFps, 1)),
      preserveFirstLast: true,
    });
    log.info(`Vision pipeline: selected ${selection.frames.length} frames (${selection.reason})`);

    const attachments = frameSender.getFrameAttachments(selection.frames);
    sessionStore.setSelectedFrameCount(attachments.length);

    if (attachments.length === 0) {
      const latest = frameSender.getLatestFrameAttachment();
      if (latest && frameSender.hasFreshFrame()) {
        log.info('Vision pipeline: no sampled frames, falling back to latest frame');
        sessionStore.setSelectedFrameCount(1);
        return { attachments: [latest], hasVisualContext: true };
      }
      log.warn('Vision pipeline: no frames available, visual context lost');
      return { attachments: [], hasVisualContext: false };
    }

    log.info(`Vision pipeline: attaching ${attachments.length} images to chat.send`);
    return { attachments, hasVisualContext: true };
  }

  private extractRunId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const maybeRunId = (payload as { runId?: unknown }).runId;
    return typeof maybeRunId === 'string' && maybeRunId.trim() ? maybeRunId : null;
  }

  private waitForAssistantReply(runId: string, transcript: string, timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
      let settled = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;

      const finish = (value: string | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (pollTimer) clearInterval(pollTimer);
        unsubscribe();
        resolve(value);
      };

      const timeout = setTimeout(() => {
        void pollHistory(true);
      }, timeoutMs);

      const unsubscribe = gatewayClient.onEvent('chat', (frame) => {
        const payload = (frame as { payload?: unknown }).payload as {
          runId?: unknown;
          state?: unknown;
          errorMessage?: unknown;
          message?: unknown;
        };

        if (payload?.runId !== runId) return;

        const state = typeof payload.state === 'string' ? payload.state : '';
        if (state === 'final') {
          finish(this.extractAssistantText(payload.message));
          return;
        }

        if (state === 'error' || state === 'aborted') {
          const errorMessage =
            typeof payload.errorMessage === 'string' ? payload.errorMessage : state;
          log.warn('Assistant run ended without final text', { runId, state, errorMessage });
          void pollHistory(true);
        }
      });

      const pollHistory = async (isLastAttempt: boolean = false): Promise<void> => {
        try {
          const replyText = await this.findAssistantReplyFromHistory(transcript);
          if (replyText) {
            log.info(`Recovered assistant reply from chat.history${isLastAttempt ? ' (timeout fallback)' : ''}`);
            finish(replyText);
            return;
          }
          if (isLastAttempt) {
            log.warn('Assistant reply not found before timeout', { runId, timeoutMs });
            finish(null);
          }
        } catch (error) {
          log.warn('chat.history fallback failed', error);
          if (isLastAttempt) finish(null);
        }
      };

      pollTimer = setInterval(() => {
        void pollHistory(false);
      }, HISTORY_POLL_INTERVAL_MS);
    });
  }

  private async findAssistantReplyFromHistory(transcript: string): Promise<string | null> {
    const payload = await gatewayClient.chatHistory(DEFAULT_CHAT_SESSION_KEY, 12) as {
      messages?: unknown[];
    };
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const transcriptNeedle = transcript.trim();

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!message || typeof message !== 'object') continue;
      const role = (message as { role?: unknown }).role;
      if (role !== 'user') continue;

      const userText = this.extractAssistantText(message);
      if (!userText || !userText.includes(transcriptNeedle)) continue;

      for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
        const nextMessage = messages[nextIndex];
        if (!nextMessage || typeof nextMessage !== 'object') continue;
        const nextRole = (nextMessage as { role?: unknown }).role;
        if (nextRole === 'assistant') {
          return this.extractAssistantText(nextMessage);
        }
        if (nextRole === 'user') break;
      }
    }

    return null;
  }

  private extractAssistantText(message: unknown): string | null {
    if (!message || typeof message !== 'object') return null;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) return null;

    const text = content
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return '';
        const value = (entry as { text?: unknown }).text;
        return typeof value === 'string' ? value.trim() : '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();

    return text || null;
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
   * Tap to Talk sessions stay active until the user explicitly stops them.
   */
  private startIdleMonitor(): void {
    this.stopIdleMonitor();
  }

  private stopIdleMonitor(): void {
    if (idleTimer) {
      clearInterval(idleTimer);
      idleTimer = null;
    }
  }
}

export const wakeUpManager = new WakeUpManager();
