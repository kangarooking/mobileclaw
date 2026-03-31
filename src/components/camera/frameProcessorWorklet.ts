/**
 * Frame Processor Worklet — runs on Vision Camera's dedicated frame thread.
 *
 * This file is compiled by the vision-camera babel plugin and executes on a
 * separate thread (NOT the JS main thread). It has access to:
 *  - The raw camera frame (YUV/RGB pixel data)
 *  - A limited subset of JS APIs (no React, no async, no DOM)
 *
 * Vision Camera v4 notes:
 *  - Frames are automatically managed by the runtime (no .close() needed)
 *  - Use frame.toArrayBuffer() for raw pixel access
 *  - For JPEG encoding, a native Frame Processor Plugin is ideal;
 *    here we fall back to raw base64 (larger but works for MVP)
 */

import type { Frame } from 'react-native-vision-camera';

// ─── Configuration ────────────────────────────────────────────────

/** Throttle: only send a frame if >67ms elapsed since last (~15fps) */
const THROTTLE_MS = 67;

// ─── State (persists across frames on the worklet thread) ─────────────

let lastFrameTimestamp = 0;
let frameCount = 0;

// ─── Callback bridge to JS main thread ──────────────────────────────

type OnFrameCallback = (
  dataBase64: string,
  width: number,
  height: number,
  timestamp: number,
) => void;

let jsCallback: OnFrameCallback | null = null;

/**
 * Set the callback that receives processed frames on the JS main thread.
 */
export function setFrameCallback(callback: OnFrameCallback): void {
  jsCallback = callback;
}

/** Get total frames processed since init (for debugging). */
export function getFrameCount(): number {
  return frameCount;
}

/** Reset frame counter. */
export function resetFrameCount(): void {
  frameCount = 0;
  lastFrameTimestamp = 0;
}

// ─── Main Frame Processor ────────────────────────────────────────────

/**
 * Frame processor function — called for every camera frame on the dedicated thread.
 *
 * Pipeline per frame:
 *  1. Check throttle (skip if too soon since last frame)
 *  2. Convert frame to ArrayBuffer (raw pixel data)
 *  3. Encode as base64 string
 *  4. Bridge to JS main thread via runOnJS callback
 *
 * Note: In v4, frames are automatically recycled by the runtime.
 * No need to call frame.close().
 */
export function processFrame(frame: Frame): void {
  // Throttle check
  const now = Date.now();
  if (now - lastFrameTimestamp < THROTTLE_MS) {
    return;
  }

  lastFrameTimestamp = now;
  frameCount++;

  try {
    // Get raw pixel data as ArrayBuffer (YUV or RGB depending on pixelFormat)
    const buffer = frame.toArrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Convert to base64 string for transmission
    // TODO: Replace with JPEG encoding via native Frame Processor Plugin
    //       for ~10x size reduction. Raw base64 of 640x480 ≈ 600KB vs JPEG ≈ 30KB
    let binary = '';
    // Chunk to avoid stack overflow on large frames
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);

    const { width, height } = frame;

    // Send to JS main thread
    if (jsCallback) {
      'worklet';
      jsCallback(base64, width, height, now);
    }
  } catch (error) {
    // Never crash the worklet thread — silently skip failed frames
    console.error('[FrameProcessor] Error:', String(error));
  }
}
