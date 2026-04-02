/**
 * frameSender — Dual-strategy video frame sending
 *
 * Strategy A: Cache latest JPEG frame → attach to chat.send message when user speaks
 * Strategy B: Send continuous video_frame events at configurable fps
 */

import type { GatewayClient } from '../gateway/GatewayClient';
import { cameraManager } from './CameraManager';
import type { BufferedVisualFrame } from './VisualFrameBuffer';
import { useSessionStore } from '@/store/useSessionStore';
import { getLogger } from '@/utils/logger';
import {
  DEFAULT_VIDEO_FPS,
  DEFAULT_VIDEO_RESOLUTION,
} from '@/utils/constants';

const log = getLogger('frameSender');

export class FrameSender {
  private gateway: GatewayClient | null = null;
  private strategyBInterval: ReturnType<typeof setInterval> | null = null;
  private strategyBFps = DEFAULT_VIDEO_FPS;
  /** Total frames sent via Strategy B since last start */
  private strategyBSentCount = 0;

  bindGateway(gateway: GatewayClient): void {
    this.gateway = gateway;
  }

  // ─── Strategy A: Snapshot attachment ──────────────────────────────

  /**
   * Get the latest cached frame as a chat.send attachment.
   * Returns attachment object (or null if no frame captured yet).
   */
  getLatestFrameAttachment(): Record<string, unknown> | null {
    const frame = cameraManager.latestFrame;
    if (!frame) return null;

    const w = cameraManager.latestFrameWidth || DEFAULT_VIDEO_RESOLUTION.width;
    const h = cameraManager.latestFrameHeight || DEFAULT_VIDEO_RESOLUTION.height;

    return {
      type: 'image',
      mimeType: 'image/jpeg',
      fileName: `frame_${Date.now()}.jpg`,
      content: frame,
      meta: { w, h },
    };
  }

  getFrameAttachments(frames: BufferedVisualFrame[]): Array<Record<string, unknown>> {
    return frames.map((frame, index) => ({
      type: 'image',
      mimeType: 'image/jpeg',
      fileName: `speech_frame_${index + 1}.jpg`,
      content: frame.base64,
      meta: {
        w: frame.width,
        h: frame.height,
        index,
        timestamp: frame.timestamp,
      },
    }));
  }

  /**
   * Check if a fresh frame is available (captured within last 3 seconds).
   */
  hasFreshFrame(maxAgeMs: number = 3000): boolean {
    if (!cameraManager.latestFrame) return false;
    return Date.now() - cameraManager.latestFrameTimestamp < maxAgeMs;
  }

  // ─── Strategy B: Continuous event stream ──────────────────────────

  /**
   * Start continuous video_frame event streaming.
   * Sends frames at `fps` rate via GatewayClient.sendEvent('video_frame', ...).
   *
   * @param fps Frames per second for the continuous stream (default: 5)
   */
  startContinuousStream(fps: number = DEFAULT_VIDEO_FPS): void {
    this.stopContinuousStream();
    this.strategyBFps = fps;
    this.strategyBSentCount = 0;
    const intervalMs = Math.round(1000 / fps);

    log.info(`Starting continuous video_frame stream at ${fps}fps (${intervalMs}ms interval)`);

    this.strategyBInterval = setInterval(() => {
      if (!this.gateway) return;

      const frame = cameraManager.latestFrame;
      if (!frame) return;

      const w = cameraManager.latestFrameWidth || DEFAULT_VIDEO_RESOLUTION.width;
      const h = cameraManager.latestFrameHeight || DEFAULT_VIDEO_RESOLUTION.height;

      this.gateway.sendEvent('video_frame', {
        base64_jpeg: frame,
        w,
        h,
        ts: Date.now(),
      });

      this.strategyBSentCount++;
      useSessionStore.getState().incrementFramesSent();
    }, intervalMs);
  }

  /**
   * Stop continuous video_frame streaming.
   */
  stopContinuousStream(): void {
    if (this.strategyBInterval) {
      clearInterval(this.strategyBInterval);
      this.strategyBInterval = null;
      log.info(
        `Stopped continuous video_frame stream (sent ${this.strategyBSentCount} frames this session)`,
      );
      this.strategyBSentCount = 0;
    }
  }

  /** Get total frames sent by current Strategy B session */
  getStrategyBSentCount(): number {
    return this.strategyBSentCount;
  }

  destroy(): void {
    this.stopContinuousStream();
    this.gateway = null;
  }
}

export const frameSender = new FrameSender();
