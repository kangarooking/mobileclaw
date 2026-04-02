/**
 * CameraManager — Camera lifecycle management
 *
 * Manages react-native-vision-camera v4 device selection,
 * and coordinates with FrameProcessor for real-time frame capture.
 */

import { Camera } from 'react-native-vision-camera';
import { getLogger } from '@/utils/logger';
import { visualFrameBuffer } from './VisualFrameBuffer';

const log = getLogger('CameraManager');

export class CameraManager {
  private device: unknown = null;
  private isRunning = false;

  /** Latest captured frame data (base64 string), updated by frame processor */
  public latestFrame: string | null = null;
  public latestFrameTimestamp: number = 0;
  public latestFrameWidth: number = 0;
  public latestFrameHeight: number = 0;
  public onFrameReady: ((dataBase64: string, width: number, height: number, timestamp: number) => void) | null = null;

  async initialize(): Promise<void> {
    const cameraPermission = await Camera.requestCameraPermission();
    if (cameraPermission !== 'granted') {
      throw new Error('Camera permission denied');
    }

    // Get all camera devices and pick back camera (v4 API: no args, filter by position)
    const allDevices = Camera.getAvailableCameraDevices();
    this.device =
      allDevices.find((d: any) => d.position === 'back') ??
      allDevices[0] ?? null;

    if (!this.device) {
      throw new Error('No back camera available');
    }

    log.info('Camera initialized: device found');
  }

  getDevice(): unknown {
    return this.device;
  }

  setRunning(running: boolean): void {
    this.isRunning = running;
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Called by the frame processor worklet when a new frame is ready.
   */
  onNewFrame(dataBase64: string, width: number, height: number, timestamp: number): void {
    this.latestFrame = dataBase64;
    this.latestFrameTimestamp = timestamp;
    this.latestFrameWidth = width;
    this.latestFrameHeight = height;
    visualFrameBuffer.push({
      id: `vf_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
      base64: dataBase64,
      width,
      height,
      timestamp,
    });
    this.onFrameReady?.(dataBase64, width, height, timestamp);
  }

  clearBufferedFrames(): void {
    visualFrameBuffer.clear();
  }
}

export const cameraManager = new CameraManager();
