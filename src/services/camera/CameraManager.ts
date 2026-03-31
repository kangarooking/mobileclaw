/**
 * CameraManager — Camera lifecycle management
 *
 * Manages react-native-vision-camera device selection, format configuration,
 * and coordinates with FrameProcessor for real-time frame capture.
 */

import { Camera, type CameraDevice, type CameraDeviceFormat } from 'react-native-vision-camera';
import { getLogger } from '@/utils/constants';

const log = getLogger('CameraManager');

export class CameraManager {
  private device: CameraDevice | null = null;
  private format: CameraDeviceFormat | null = null;
  private isRunning = false;

  /** Latest captured JPEG frame (base64), updated by frame processor */
  public latestFrame: string | null = null;
  public latestFrameTimestamp: number = 0;
  public onFrameReady: ((jpegBase64: string, width: number, height: number, timestamp: number) => void) | null = null;

  async initialize(): Promise<void> {
    const cameraPermission = await Camera.requestCameraPermission();
    if (cameraPermission !== 'granted') {
      throw new Error('Camera permission denied');
    }

    // Get back camera (prefer wide-angle or first available)
    const devices = Camera.getAvailableCameraDevices('back');
    this.device =
      devices.find((d) => d.supportsLowLightBoost) ?? devices[0];

    if (!this.device) {
      throw new Error('No back camera available');
    }

    // Find best matching format
    this.format = this.device.supportedFormats.find(
      (f) =>
        f.videoWidth === 640 &&
        f.videoHeight === 480 &&
        f.frameRateRanges.some((r) => r.maxFrameRate >= 15),
    ) ?? this.device.supportedFormats[0];

    log.info(
      `Camera initialized: ${this.device?.deviceName}, format: ${this.format?.videoWidth}x${this.format?.videoHeight}`,
    );
  }

  getDevice(): CameraDevice | null {
    return this.device;
  }

  getFormat(): CameraDeviceFormat | null {
    return this.format;
  }

  setRunning(running: boolean): void {
    this.isRunning = running;
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Called by the frame processor worklet when a new JPEG frame is ready
   */
  onNewFrame(jpegBase64: string, width: number, height: number, timestamp: number): void {
    this.latestFrame = jpegBase64;
    this.latestFrameTimestamp = timestamp;
    this.onFrameReady?.(jpegBase64, width, height, timestamp);
  }
}

export const cameraManager = new CameraManager();
