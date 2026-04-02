/**
 * AudioCaptureBridge — Bridges mic input to ASR provider
 *
 * Uses the iOS HeaderWebSocket native module to stream 16kHz PCM
 * frames from the microphone into the active ASR provider.
 */

import { asrService } from './ASRService';
import { audioManager } from './AudioManager';
import { getLogger } from '@/utils/logger';
import { NativeEventEmitter, NativeModules, type EmitterSubscription } from 'react-native';

const log = getLogger('AudioCaptureBridge');
const nativeBridge = NativeModules.HeaderWebSocket;
const nativeEmitter = nativeBridge ? new NativeEventEmitter(nativeBridge) : null;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class AudioCaptureBridge {
  private isCapturing = false;
  private audioSub: EmitterSubscription | null = null;
  private errorSub: EmitterSubscription | null = null;
  private statusSub: EmitterSubscription | null = null;
  private pcmFrameCount = 0;
  private hasLoggedFirstFrame = false;
  private startupCheckTimer: ReturnType<typeof setTimeout> | null = null;

  async startCapture(): Promise<void> {
    if (this.isCapturing) return;
    log.info('Starting audio capture bridge...');

    try {
      if (!nativeBridge?.startAudioCapture || !nativeBridge?.stopAudioCapture) {
        throw new Error('HeaderWebSocket audio capture bridge is not available');
      }
      if (!nativeEmitter) {
        throw new Error('HeaderWebSocket event emitter is not available');
      }

      this.audioSub = nativeEmitter.addListener('onAudioData', (event: { data?: number[] }) => {
        if (!this.isCapturing || !Array.isArray(event?.data) || event.data.length === 0) return;
        try {
          const pcmBytes = Uint8Array.from(event.data);
          this.pcmFrameCount += 1;
          if (!this.hasLoggedFirstFrame) {
            this.hasLoggedFirstFrame = true;
            log.info('Received first PCM frame from native capture:', pcmBytes.length, 'bytes');
          }
          audioManager.emitVolumeLevel(this.computeLevel(pcmBytes));
          asrService.feedPCM(pcmBytes);
        } catch (error) {
          log.warn('Failed to forward PCM frame:', getErrorMessage(error));
        }
      });

      this.errorSub = nativeEmitter.addListener('onAudioCaptureError', (event: { message?: string }) => {
        log.warn('Native audio capture error:', event?.message || 'unknown error');
      });

      this.statusSub = nativeEmitter.addListener('onAudioCaptureStatus', (event: Record<string, unknown>) => {
        log.info('Native audio capture status:', JSON.stringify(event));
      });

      await nativeBridge.startAudioCapture();
      this.isCapturing = true;
      this.pcmFrameCount = 0;
      this.hasLoggedFirstFrame = false;
      try {
        const debugInfo = await nativeBridge.getAudioCaptureDebugInfo?.();
        if (debugInfo) {
          log.info('Native audio capture debug info:', JSON.stringify(debugInfo));
        }
      } catch (error) {
        log.warn('Failed to fetch native audio capture debug info:', getErrorMessage(error));
      }
      this.startupCheckTimer = setTimeout(() => {
        if (this.isCapturing && this.pcmFrameCount === 0) {
          log.warn('No PCM frames received within 2s of starting capture');
        }
      }, 2000);
      log.info('✅ PCM capture running — audio → ASR');
    } catch (err) {
      log.warn('⚠️ PCM bridge failed (non-critical):', getErrorMessage(err));
      this.cleanupListeners();
    }
  }

  async stopCapture(): Promise<void> {
    if (!this.isCapturing) return;
    this.isCapturing = false;
    try {
      await NativeModules.HeaderWebSocket?.stopAudioCapture?.();
    } catch {}
    this.cleanupListeners();
    log.info('Audio capture stopped');
  }

  getIsCapturing(): boolean { return this.isCapturing; }

  private cleanupListeners(): void {
    if (this.audioSub) {
      this.audioSub.remove();
      this.audioSub = null;
    }
    if (this.errorSub) {
      this.errorSub.remove();
      this.errorSub = null;
    }
    if (this.statusSub) {
      this.statusSub.remove();
      this.statusSub = null;
    }
    if (this.startupCheckTimer) {
      clearTimeout(this.startupCheckTimer);
      this.startupCheckTimer = null;
    }
  }

  private computeLevel(pcmBytes: Uint8Array): number {
    if (pcmBytes.length < 2) return 0;

    let sumSquares = 0;
    let sampleCount = 0;

    for (let i = 0; i + 1 < pcmBytes.length; i += 2) {
      const sample = (pcmBytes[i] | (pcmBytes[i + 1] << 8));
      const signed = sample >= 0x8000 ? sample - 0x10000 : sample;
      const normalized = signed / 0x8000;
      sumSquares += normalized * normalized;
      sampleCount++;
    }

    if (sampleCount === 0) return 0;
    return Math.min(1, Math.sqrt(sumSquares / sampleCount) * 2.2);
  }
}

export const audioCaptureBridge = new AudioCaptureBridge();
