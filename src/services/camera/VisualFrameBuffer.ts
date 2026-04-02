import { getLogger } from '@/utils/logger';

const log = getLogger('VisualFrameBuffer');

export interface BufferedVisualFrame {
  id: string;
  base64: string;
  width: number;
  height: number;
  timestamp: number;
  hash?: string;
}

export interface VisualBufferConfig {
  maxWindowMs: number;
  maxFrames: number;
}

const DEFAULT_CONFIG: VisualBufferConfig = {
  maxWindowMs: 4_000,
  maxFrames: 48,
};

export class VisualFrameBuffer {
  private config: VisualBufferConfig = DEFAULT_CONFIG;
  private frames: BufferedVisualFrame[] = [];

  configure(config: Partial<VisualBufferConfig>): void {
    this.config = { ...this.config, ...config };
    this.prune();
  }

  push(frame: BufferedVisualFrame): void {
    this.frames.push(frame);
    this.prune(frame.timestamp);
  }

  getFramesBetween(startAt: number, endAt: number): BufferedVisualFrame[] {
    return this.frames.filter((frame) => frame.timestamp >= startAt && frame.timestamp <= endAt);
  }

  getLatest(): BufferedVisualFrame | null {
    return this.frames.at(-1) ?? null;
  }

  size(): number {
    return this.frames.length;
  }

  prune(now: number = Date.now()): void {
    const minTimestamp = now - this.config.maxWindowMs;
    this.frames = this.frames.filter((frame) => frame.timestamp >= minTimestamp);
    if (this.frames.length > this.config.maxFrames) {
      this.frames = this.frames.slice(-this.config.maxFrames);
    }
  }

  clear(): void {
    if (this.frames.length > 0) {
      log.info(`Clearing ${this.frames.length} buffered visual frames`);
    }
    this.frames = [];
  }
}

export const visualFrameBuffer = new VisualFrameBuffer();
