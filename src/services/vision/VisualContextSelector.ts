import type { BufferedVisualFrame } from '@/services/camera/VisualFrameBuffer';

export interface VisualSelectionOptions {
  maxFrames: number;
  minGapMs: number;
  preserveFirstLast: boolean;
}

export interface SelectedVisualContext {
  frames: BufferedVisualFrame[];
  reason: 'full' | 'sampled';
}

const DEFAULT_OPTIONS: VisualSelectionOptions = {
  maxFrames: 7,
  minGapMs: 120,
  preserveFirstLast: true,
};

export class VisualContextSelector {
  select(
    candidates: BufferedVisualFrame[],
    options: Partial<VisualSelectionOptions> = {},
  ): SelectedVisualContext {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    if (candidates.length <= merged.maxFrames) {
      return {
        frames: this.applyMinGap(candidates, merged.minGapMs),
        reason: 'full',
      };
    }

    const sampled: BufferedVisualFrame[] = [];
    const usableSlots = Math.max(
      merged.preserveFirstLast ? merged.maxFrames - 2 : merged.maxFrames,
      0,
    );

    if (merged.preserveFirstLast) {
      sampled.push(candidates[0]);
    }

    if (usableSlots > 0) {
      const middle = candidates.slice(1, -1);
      for (let i = 0; i < usableSlots; i++) {
        const position = Math.floor(((i + 1) * middle.length) / (usableSlots + 1));
        const frame = middle[Math.min(position, Math.max(middle.length - 1, 0))];
        if (frame) sampled.push(frame);
      }
    }

    if (merged.preserveFirstLast) {
      sampled.push(candidates[candidates.length - 1]);
    }

    return {
      frames: this.applyMinGap(this.dedupeById(sampled), merged.minGapMs).slice(0, merged.maxFrames),
      reason: 'sampled',
    };
  }

  private dedupeById(frames: BufferedVisualFrame[]): BufferedVisualFrame[] {
    const seen = new Set<string>();
    return frames.filter((frame) => {
      if (seen.has(frame.id)) return false;
      seen.add(frame.id);
      return true;
    });
  }

  private applyMinGap(frames: BufferedVisualFrame[], minGapMs: number): BufferedVisualFrame[] {
    const selected: BufferedVisualFrame[] = [];
    for (const frame of frames.sort((a, b) => a.timestamp - b.timestamp)) {
      const last = selected.at(-1);
      if (!last || frame.timestamp - last.timestamp >= minGapMs) {
        selected.push(frame);
      }
    }
    return selected;
  }
}

export const visualContextSelector = new VisualContextSelector();
