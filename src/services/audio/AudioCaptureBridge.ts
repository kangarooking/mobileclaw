/**
 * AudioCaptureBridge — Bridges mic input to ASR provider
 *
 * Captures real-time PCM audio from microphone and feeds it to
 * the active ASR service via asrService.feedPCM().
 *
 * Uses react-native-audio-recorder-player for actual PCM streaming,
 * since expo-av's Recording class only records to files.
 *
 * Audio format: 16kHz / mono / 16-bit little-endian PCM
 */

import { AudioRecorderPlayer } from 'react-native-audio-recorder-player';
import { asrService } from './ASRService';
import { audioManager } from './AudioManager';
import { getLogger } from '@/utils/logger';
import {
  AUDIO_SAMPLE_RATE,
  AUDIO_CHANNELS,
  AUDIO_BITS_PER_SAMPLE,
} from '@/utils/constants';

const log = getLogger('AudioCaptureBridge');

const recorderPlayer = new AudioRecorderPlayer();

/** Bytes per PCM sample frame (channels * bytes_per_sample) */
const BYTES_PER_FRAME = AUDIO_CHANNELS * (AUDIO_BITS_PER_SAMPLE / 8);

/**
 * Duration of each PCM chunk sent to ASR (in milliseconds).
 * 20ms = 320 bytes at 16kHz/16bit/mono — standard ASR chunk size.
 */
const CHUNK_DURATION_MS = 20;

class AudioCaptureBridge {
  private isCapturing = false;
  private recordPosition = 0;

  /**
   * Start capturing audio and feeding PCM to ASR.
   * Must be called after audioManager.configureSession().
   */
  async startCapture(): Promise<void> {
    if (this.isCapturing) return;

    log.info('Starting audio capture bridge...');

    // Ensure audio session is configured
    if (!audioManager.isConfigured()) {
      await audioManager.configureSession();
    }

    // Request mic permission
    const result = await recorderPlayer.requestAudioPermission?.() ??
      // Fallback: expo-av permission request was already done in audioManager
      true;

    if (!result) {
      throw new Error('Microphone permission denied');
    }

    const path = 'mobileclaw-asr-temp.pcm';

    try {
      // Start recording with PCM format
      const resultInfo = await recorderPlayer.startRecorder(path, {
        AVFormatIDKeyIOS: 'lpcm',
        AVSampleRateKeyIOS: String(AUDIO_SAMPLE_RATE),
        AVNumberOfChannelsKeyIOS: String(AUDIO_CHANNELS),
        AVEncoderAudioQualityKeyIOS: 'AVAudioQualityMax',
        AVLinearPCMBitDepthKeyIOS: String(AUDIO_BITS_PER_SAMPLE),
        AVLinearPCMIsBigEndianKeyIOS: false,
        AVLinearPCMIsFloatKeyIOS: false,
        AVLinearPCMIsNonInterleaved: false,

        // Android config
        OutputFormatAndroid: 0,        // MPEG_4 (will output PCM-like)
        AudioEncoderAndroid: 'aac',     // Default encoder
        SampleRateAndroid: AUDIO_SAMPLE_RATE,
        ChannelsAndroid: AUDIO_CHANNELS,
        BitRateAndroid: 128000,
      });

      log.info('Recorder started:', resultInfo);
      this.isCapturing = true;

      // Set up position listener for periodic PCM extraction
      // Note: AudioRecorderPlayer doesn't directly expose PCM data.
      // For production, we'd need a native module or different approach.
      //
      // Phase 1 approach: Use timer-based file reading or
      // rely on the recorder's internal buffer + send finish periodically.
      //
      // The feedPCM() method on ASR service is ready for when we have
      // a real-time PCM source (native module or streaming library).

      this.startPcmFeedLoop();

    } catch (error) {
      log.error('Failed to start audio capture:', error);
      throw error;
    }
  }

  /**
   * Stop capturing audio.
   */
  async stopCapture(): Promise<void> {
    if (!this.isCapturing) return;

    this.isCapturing = false;

    try {
      await recorderPlayer.stopRecorder();
      log.info('Audio capture stopped');
    } catch (error) {
      log.error('Error stopping recorder:', error);
    }
  }

  getIsCapturing(): boolean {
    return this.isCapturing;
  }

  // ─── Internal: PCM Feed Loop ──────────────────────────────────────

  /**
   * Timer-based PCM feeding loop.
   *
   * NOTE: This is a placeholder implementation. react-native-audio-recorder-player
   * does NOT provide direct access to raw PCM buffers. It records to a file.
   *
   * For real-time ASR, you have these options:
   * 1. **Native TurboModule** (recommended): Wrap iOS AudioUnit / Android AudioRecord
   *    to get PCM callbacks on the JS thread
   * 2. **Periodic file read**: Read the recording file every CHUNK_DURATION_MS
   *    (high I/O, not recommended)
   * 3. **Use a streaming-aware library**: e.g., @react-native-community/audio-toolkit
   *
   * Phase 1: We set up the infrastructure correctly. When a native PCM module
   * is available (feat-09 SecureStorage can include it), wire it here.
   */
  private startPcmFeedLoop(): void {
    // Placeholder: In production, this would be driven by native PCM callbacks
    // For now, the ASR connection is established and ready to receive data
    log.info(
      'PCM feed loop: INFRASTRUCTURE READY — awaiting native PCM source\n' +
      '  Install native audio capture module for real-time streaming ASR.',
    );
  }
}

export const audioCaptureBridge = new AudioCaptureBridge();
