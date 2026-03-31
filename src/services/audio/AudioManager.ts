/**
 * AudioManager — Audio session configuration
 *
 * Configures platform audio session for simultaneous recording + playback.
 * Phase 1: Placeholder that logs what should be configured natively.
 * TODO: Replace with native TurboModule (AVAudioSession / AudioManager).
 */

import { Platform } from 'react-native';
import { getLogger } from '@/utils/logger';
import { AUDIO_SAMPLE_RATE } from '@/utils/constants';

const log = getLogger('AudioManager');

export interface AudioSessionConfig {
  category?: string;           // iOS: "playAndRecord"
  mode?: string;               // iOS: "voiceChat", Android: "MODE_IN_COMMUNICATION"
  bluetoothEnabled?: boolean;
  speakerphoneOn?: boolean;
  preferredSampleRate?: number;
  bufferDuration?: number;     // seconds, e.g., 0.01 for low latency
}

const DEFAULT_CONFIG: AudioSessionConfig = {
  category: 'playAndRecord',
  mode: 'voiceChat',
  bluetoothEnabled: true,
  speakerphoneOn: true,
  preferredSampleRate: AUDIO_SAMPLE_RATE,
  bufferDuration: 0.01,
};

export class AudioManager {
  private configured = false;

  /**
   * Configure audio session for simultaneous recording + playback.
   * This is THE critical setup step. Get this wrong and either:
   * - The mic doesn't work
   * - TTS can't play audio
   * - Echo feedback occurs
   */
  async configureSession(config?: Partial<AudioSessionConfig>): Promise<void> {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    if (Platform.OS === 'ios') {
      log.info('Configuring iOS AVAudioSession:', {
        category: cfg.category,
        mode: cfg.mode,
        bluetooth: cfg.bluetoothEnabled,
        sampleRate: cfg.preferredSampleRate,
        bufferDuration: cfg.bufferDuration,
      });
      // TODO: Call native module NativeAudioModule.configureSession(cfg)
      // For now, we rely on Expo's default audio session handling
    } else {
      log.info('Configuring Android AudioManager:', {
        mode: cfg.mode,
        bluetoothSco: cfg.bluetoothEnabled,
        speakerphone: cfg.speakerphoneOn,
      });
      // TODO: Call native module NativeAudioModule.configureAndroidAudio(cfg)
    }

    this.configured = true;
    log.info('Audio session configured successfully');
  }

  isConfigured(): boolean {
    return this.configured;
  }
}

export const audioManager = new AudioManager();
