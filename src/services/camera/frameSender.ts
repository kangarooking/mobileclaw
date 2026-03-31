/**
 * frameSender — Dual-strategy video frame sending
 *
 * Strategy A: Cache latest JPEG frame → attach to chat.send message when user speaks
 * Strategy B: Send continuous video_frame events at configurable fps
 */

import type { GatewayClient } from '../gateway/GatewayClient';
import { cameraManager } from './CameraManager';
import { getLogger } from '@/utils/logger';
import { DEFAULT_VIDEO_FPS } from '@/utils/constants';

const log = getLogger('frameSender');

export class FrameSender {
  private gateway: GatewayClient | null = null;
  private strategyBInterval: ReturnType<typeof setInterval> | null = null;
  private strategyBFps = DEFAULT_VIDEO_FPS;

  bindGateway(gateway: GatewayClient): void {
    this.gateway = gateway;
  }

  /**
   * Strategy A: Get the latest cached JPEG frame to attach in send() message.
   * Returns base64-encoded JPEG (or null if no frame has been captured yet).
   */
  getLatestFrameForSend(): string | null {
    return cameraManager.latestFrame;
  }

  /**
   * Strategy B: Start continuous video_frame event streaming.
   * Sends frames at `fps` rate via GatewayClient.sendEvent('video_frame', ...).
   *
   * @param fps Frames per second for the continuous stream (default: 5)
   */
  startContinuousStream(fps: number = DEFAULT_VIDEO_FPS): void {
    this.stopContinuousStream();
    this.strategyBFps = fps;
    const intervalMs = Math.round(1000 / fps);

    log.info(`Starting continuous video_frame stream at ${fps}fps`);

    this.strategyBInterval = setInterval(() => {
      if (!this.gateway) return;

      const frame = this.getLatestFrameForSend();
      if (!frame) return;

      this.gateway.sendEvent('video_frame', {
        base64_jpeg: frame,
        w: 640,
        h: 480,
        ts: Date.now(),
      });
    }, intervalMs);
  }

  /**
   * Stop continuous video_frame streaming.
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
