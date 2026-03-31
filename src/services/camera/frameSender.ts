/**
 * frameSender — Dual-strategy frame sending
 *
 * Strategy A: Cache latest frame → attach to send() message when user speaks
 * Strategy B: Send continuous video_frame events at configurable fps
 */

import type { GatewayClient } from './GatewayClient';
import { getLogger } from '@/utils/logger';
import { DEFAULT_VIDEO_FPS } from '@/utils/constants';

const log = getLogger('frameSender');

export class FrameSender {
  private gateway: GatewayClient | null = null;
  private strategyBInterval: ReturnType<typeof setInterval> | null = null;
  private strategyBFps = 5; // Continuous stream fps for Strategy B

  bindGateway(gateway: GatewayClient): void {
    this.gateway = gateway;
  }

  /**
   * Strategy A: Get latest cached frame to attach in send() message
   */
  getLatestFrameForSend(): string | null {
    // Returns base64 JPEG from CameraManager.latestFrame
    // This is called when composing a send message
    return null; // Will be wired to cameraManager.latestFrame
  }

  /**
   * Strategy B: Start continuous video_frame event streaming
   */
  startContinuousStream(
    getFrame: () => string | null,
    fps: number = DEFAULT_VIDEO_FPS,
  ): void {
    this.stopContinuousStream();
    this.strategyBFps = fps;
    const intervalMs = Math.round(1000 / fps);

    log.info(`Starting continuous video_frame stream at ${fps}fps`);

    this.strategyBInterval = setInterval(() => {
      if (!this.gateway) return;

      const frame = getFrame();
      if (!frame) return;

      this.gateway!.sendEvent('video_frame', {
        base64_jpeg: frame,
        ts: Date.now(),
      });
    }, intervalMs);
  }

  /**
   * Stop continuous video_frame streaming
   */
  stopContinuousStream(): void {
    if (this.strategyBInterval) {
      clearInterval(this.strategyBInterval);
      this.strategyBInterval = null;
      log.info('Stopped continuous video_frame stream');
    }
  }

  destroy(): void {
    this.stopContinuousStream();
    this.gateway = null;
  }
}

export const frameSender = new FrameSender();
