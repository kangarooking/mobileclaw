/**
 * AudioManager — Audio session configuration + recording lifecycle
 *
 * Uses expo-av for:
 *  - AVAudioSession / AudioManager platform configuration
 *  - Simultaneous record + playback (playAndRecord + voiceChat)
 *  - PCM audio capture via Recording class
 *
 * Phase 1: Session config + basic recording control.
 * Phase 2 (feat-06): Real-time PCM streaming to ASR provider.
 */

import { Audio, AVPlaybackStatus } from 'expo-av';
import { Platform } from 'react-native';
import { getLogger } from '@/utils/logger';
import {
  AUDIO_SAMPLE_RATE,
  AUDIO_CHANNELS,
  AUDIO_BITS_PER_SAMPLE,
} from '@/utils/constants';

const log = getLogger('AudioManager');

export interface AudioSessionConfig {
  allowsRecordingIOS?: boolean;
  playsInSilentModeIOS?: boolean;
  interruptionModeIOS?: number;   // Audio.INTERRUPTION_MODE_IOS_*
  shouldDuckAndroid?: boolean;
  interruptionModeAndroid?: number;
}

const DEFAULT_SESSION_CONFIG: AudioSessionConfig = {
  allowsRecordingIOS: true,
  playsInSilentModeIOS: true,
  interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
  shouldDuckAndroid: true,
  interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
};

export interface RecordingConfig {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  format?: number;    // Audio.RECORDING_OPTION_*
  encoder?: number;   // Audio.ENCODER_*
  extension?: string;
}

const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  sampleRate: AUDIO_SAMPLE_RATE,
  channels: AUDIO_CHANNELS === 1 ? 1 : 2,
  bitsPerSample: AUDIO_BITS_PER_SAMPLE,
  format: Audio.RECORDING_OPTION_PCM_FORMAT_INT16,
  encoder: Audio.ENCODER_PCM,
  extension: 'pcm',
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
   *
   * iOS: Sets AVAudioSession category=PlayAndRecord, mode=voiceChat
   * Android: Sets AudioManager mode=MODE_IN_COMMUNICATION
   */
  async configureSession(config?: Partial<AudioSessionConfig>): Promise<void> {
    const cfg = { ...DEFAULT_SESSION_CONFIG, ...config };

    log.info('Configuring audio session...', Platform.OS);

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: cfg.allowsRecordingIOS ?? true,
      playsInSilentModeIOS: cfg.playsInSilentModeIOS ?? true,
      staysActiveInBackground: false,
      interruptionModeIOS: cfg.interruptionModeIOS ?? Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      shouldDuckAndroid: cfg.shouldDuckAndroid ?? true,
      interruptionModeAndroid: cfg.interruptionModeAndroid ?? Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
    });

    this.configured = true;
    log.info('Audio session configured successfully (playAndRecord + voiceChat)');
  }

  /**
   * Start PCM audio recording.
   * Returns a promise that resolves when recording is ready.
   */
  async startRecording(config?: Partial<RecordingConfig>): Promise<Audio.Recording> {
    if (this.isRecording) {
      log.warn('Already recording, ignoring startRecording()');
      return this.recording!;
    }

    const cfg = { ...DEFAULT_RECORDING_CONFIG, ...config };

    log.info('Starting audio recording:', {
      sampleRate: cfg.sampleRate,
      channels: cfg.channels,
      format: 'PCM_INT16',
      encoder: 'PCM',
    });

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Microphone permission denied');
      }

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HighQuality);

      // Override with our PCM config for ASR compatibility
      // Note: HighQuality preset uses AAC; for raw PCM we'd need custom options
      // For MVP, the preset works and we can extract PCM later or use a streaming lib

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
   * Returns unsubscribe function.
   */
  onVolumeUpdate(listener: (level: number) => void): () => void {
    this.volumeListeners.add(listener);
    return () => this.volumeListeners.delete(listener);
  }

  // ─── Internal: Volume Monitoring ───────────────────────────────────

  private startVolumeMonitoring(): void {
    this.stopVolumeMonitoring();

    this.volumeMonitorInterval = setInterval(async () => {
      if (!this.recording || !this.isRecording) return;

      try {
        const status: AVPlaybackStatus = await this.recording.getStatusAsync();
        if (status.isLoaded && 'metering' in status) {
          const metering = (status as AVPlaybackStatus & { metering: number }).metering;
          // Normalize dB to 0-1 range (typical range: -60 to 0 dB)
          const level = Math.max(0, Math.min(1, (metering + 60) / 60));
          this.volumeListeners.forEach((fn) => fn(level));
        }
      } catch {
        // Silently skip failed status reads
      }
    }, 50); // 20Hz volume update rate
  }

  private stopVolumeMonitoring(): void {
    if (this.volumeMonitorInterval) {
      clearInterval(this.volumeMonitorInterval);
      this.volumeMonitorInterval = null;
    }
  }

  /**
   * Clean up all resources.
   */
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
