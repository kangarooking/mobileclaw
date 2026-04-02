/**
 * AudioManager — Audio session configuration + recording lifecycle
 *
 * Uses expo-av v16 for:
 *  - AVAudioSession / AudioManager platform configuration
 *  - Simultaneous record + playback (playAndRecord + voiceChat)
 *  - Audio recording with volume monitoring for waveform visualization
 */

import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { getLogger } from '@/utils/logger';

const log = getLogger('AudioManager');

export interface AudioSessionConfig {
  allowsRecordingIOS?: boolean;
  playsInSilentModeIOS?: boolean;
  interruptionModeIOS?: number;   // InterruptionModeIOS enum value
  shouldDuckAndroid?: boolean;
  interruptionModeAndroid?: number; // InterruptionModeAndroid enum value
}

const DEFAULT_SESSION_CONFIG: AudioSessionConfig = {
  allowsRecordingIOS: true,
  playsInSilentModeIOS: true,
  interruptionModeIOS: 1, // InterruptionModeIOS.DoNotMix
  shouldDuckAndroid: true,
  interruptionModeAndroid: 1, // InterruptionModeAndroid.DoNotMix
};

export class AudioManager {
  private configured = false;
  private recording: Audio.Recording | null = null;
  private isRecording = false;

  // Volume level callback (for waveform visualization)
  private volumeListeners: Set<(level: number) => void> = new Set();
  private volumeMonitorInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Configure audio session for simultaneous recording + playback.
   */
  async configureSession(config?: Partial<AudioSessionConfig>): Promise<void> {
    const cfg = { ...DEFAULT_SESSION_CONFIG, ...config };

    log.info('Configuring audio session...', Platform.OS);

    // Retry up to 3 times — iOS may briefly put app in background during
    // permission dialogs (camera/mic), causing "experience in background" error.
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: cfg.allowsRecordingIOS ?? true,
          playsInSilentModeIOS: cfg.playsInSilentModeIOS ?? true,
          staysActiveInBackground: false,
          interruptionModeIOS: cfg.interruptionModeIOS ?? 1, // DoNotMix
          shouldDuckAndroid: cfg.shouldDuckAndroid ?? true,
          interruptionModeAndroid: cfg.interruptionModeAndroid ?? 1, // DoNotMix
        } as any); // Cast to satisfy v16 type checking

        this.configured = true;
        log.info('Audio session configured successfully');
        return;
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('background') && attempt < MAX_RETRIES - 1) {
          log.warn(`Audio session in background (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in 500ms...`);
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        throw err;
      }
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Request microphone permission without starting a second recorder.
   */
  async ensureMicrophonePermission(): Promise<void> {
    const permission = await Audio.requestPermissionsAsync();
    log.info('Mic permission result:', permission.status);
    if (permission.status !== 'granted') {
      const { Alert } = require('react-native');
      Alert.alert(
        '需要麦克风权限',
        '请在设置中允许 MobileClaw 访问麦克风，否则无法进行语音识别。\n\n设置 → 隐私 → 麦克风',
        [{ text: '知道了' }]
      );
      throw new Error(`Microphone permission ${permission.status}`);
    }
  }

  /**
   * Start expo-av recording for local metering-only scenarios.
   */
  async startRecording(): Promise<Audio.Recording> {
    if (this.isRecording) {
      log.warn('Already recording, ignoring startRecording()');
      return this.recording!;
    }

    log.info('Starting audio recording...');

    try {
      await this.ensureMicrophonePermission();

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HighQuality);
      await recording.startAsync();

      this.recording = recording;
      this.isRecording = true;

      // Start volume monitoring for waveform
      this.startVolumeMonitoring();

      log.info('Recording started successfully');
      return recording;
    } catch (error) {
      log.error('Failed to start recording:', error);
      throw error;
    }
  }

  /**
   * Stop current recording and return the recorded file URI.
   */
  async stopRecording(): Promise<string | null> {
    if (!this.recording || !this.isRecording) return null;

    this.stopVolumeMonitoring();

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      log.info('Recording stopped, URI:', uri);
      this.isRecording = false;
      this.recording = null;
      return uri;
    } catch (error) {
      log.error('Error stopping recording:', error);
      this.isRecording = false;
      this.recording = null;
      return null;
    }
  }

  /** Check if currently recording */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Register a listener for volume level updates (for WaveformView).
   */
  onVolumeUpdate(listener: (level: number) => void): () => void {
    this.volumeListeners.add(listener);
    return () => this.volumeListeners.delete(listener);
  }

  emitVolumeLevel(level: number): void {
    const normalized = Math.max(0, Math.min(1, level));
    this.volumeListeners.forEach((fn) => fn(normalized));
  }

  // ─── Internal: Volume Monitoring ───────────────────────────────────

  private startVolumeMonitoring(): void {
    this.stopVolumeMonitoring();

    this.volumeMonitorInterval = setInterval(async () => {
      if (!this.recording || !this.isRecording) return;

      try {
        const status = await this.recording.getStatusAsync() as Record<string, unknown>;
        if (status.isLoaded && 'metering' in status) {
          const metering = status.metering as number;
          const level = Math.max(0, Math.min(1, (metering + 60) / 60));
          this.volumeListeners.forEach((fn) => fn(level));
        }
      } catch {
        // Silently skip failed status reads
      }
    }, 50);
  }

  private stopVolumeMonitoring(): void {
    if (this.volumeMonitorInterval) {
      clearInterval(this.volumeMonitorInterval);
      this.volumeMonitorInterval = null;
    }
  }

  destroy(): void {
    this.stopVolumeMonitoring();
    if (this.isRecording && this.recording) {
      this.recording.stopAndUnloadAsync().catch(() => {});
      this.isRecording = false;
      this.recording = null;
    }
  }
}

export const audioManager = new AudioManager();
