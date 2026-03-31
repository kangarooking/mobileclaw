/**
 * App-wide constants
 */

export const APP_NAME = 'MobileClaw';
export const APP_VERSION = '1.0.0';

// OpenClaw protocol
export const PROTOCOL_VERSION = 3;

// Connection
export const WS_DEFAULT_TIMEOUT_MS = 30_000;       // RPC timeout
export const RECONNECT_BASE_DELAY_MS = 1_000;
export const RECONNECT_MAX_DELAY_MS = 60_000;
export const RECONNECT_MAX_ATTEMPTS = 30;
export const HEARTBEAT_INTERVAL_MS = 15_000;        // OpenClaw default tick interval

// Camera
export const DEFAULT_VIDEO_RESOLUTION = { width: 640, height: 480 };
export const DEFAULT_VIDEO_FPS = 15;
export const DEFAULT_JPEG_QUALITY = 0.7;
export const CAMERA_FRAME_THROTTLE_MS = 67;          // ~15fps = 67ms interval

// Audio
export const AUDIO_SAMPLE_RATE = 16_000;
export const AUDIO_CHANNELS = 1;
export const AUDIO_BITS_PER_SAMPLE = 16;

// Session
export const IDLE_TIMEOUT_MS = 30_000;               // 30 seconds of silence → auto-idle
export const IDLE_WARNING_MS = 25_000;                // Show warning at 25s

// URL Scheme
export const URL_SCHEME = 'mobileclaw';
export const URL_ACTIVATE_PATH = 'activate';
