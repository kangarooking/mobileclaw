export interface SpeechVisualWindow {
  speechStartAt: number;
  speechEndAt: number;
  preRollMs: number;
  postRollMs: number;
  frameWindowStartAt: number;
  frameWindowEndAt: number;
}

export class SpeechVisualSession {
  private speechStartAt: number | null = null;
  private speechEndAt: number | null = null;

  beginSpeech(timestamp: number = Date.now()): void {
    if (this.speechStartAt === null) {
      this.speechStartAt = timestamp;
    }
    this.speechEndAt = null;
  }

  endSpeech(timestamp: number = Date.now(), preRollMs: number = 500, postRollMs: number = 300): SpeechVisualWindow | null {
    if (this.speechStartAt === null) return null;
    this.speechEndAt = timestamp;

    return {
      speechStartAt: this.speechStartAt,
      speechEndAt: this.speechEndAt,
      preRollMs,
      postRollMs,
      frameWindowStartAt: this.speechStartAt - preRollMs,
      frameWindowEndAt: this.speechEndAt + postRollMs,
    };
  }

  reset(): void {
    this.speechStartAt = null;
    this.speechEndAt = null;
  }
}

export const speechVisualSession = new SpeechVisualSession();
