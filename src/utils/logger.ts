/**
 * Structured logger for MobileClaw
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'warn'; // Default to warn to reduce noise

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogger(moduleName: string) {
  return {
    debug: (msg: string, ...args: unknown[]) =>
      log('debug', moduleName, msg, args),
    info: (msg: string, ...args: unknown[]) =>
      log('info', moduleName, msg, args),
    warn: (msg: string, ...args: unknown[]) =>
      log('warn', moduleName, msg, args),
    error: (msg: string, ...args: unknown[]) =>
      log('error', moduleName, msg, args),
  };
}

function log(
  level: LogLevel,
  module: string,
  msg: string,
  args: unknown[],
): void {
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[currentLevel]) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${module}]`;

  switch (level) {
    case 'debug':
    case 'info':
      console.log(prefix, msg, ...args);
      break;
    case 'warn':
      console.warn(prefix, msg, ...args);
      break;
    case 'error':
      console.error(prefix, msg, ...args);
      break;
  }
}
