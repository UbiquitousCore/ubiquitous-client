/**
 * Minimal logging: one routing point so subsystems never call `console.*`
 * directly. Level is sticky in `localStorage` (`ubiquitousDebug` 1/2/3); `?log=`
 * wins for a single load. Default quiet (a zone is thousands of resources).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** The numeric aliases the localStorage flag uses. */
const BY_NUMBER: Record<string, LogLevel> = { 1: 'debug', 2: 'warn', 3: 'error' };

export const LOG_STORAGE_KEY = 'ubiquitousDebug';

function stored(): LogLevel | null {
  try {
    const raw = globalThis.localStorage?.getItem(LOG_STORAGE_KEY);
    if (!raw) return null;
    const value = raw.trim().toLowerCase();
    if (value in ORDER) return value as LogLevel;
    return BY_NUMBER[value] ?? null;
  } catch {
    // No localStorage in a worker without one, or storage is blocked.
    return null;
  }
}

let threshold = ORDER[stored() ?? 'warn'];

export function setLogLevel(level: LogLevel): void {
  threshold = ORDER[level];
}

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  /**
   * Log once per distinct key, then count.
   *
   * For failures that repeat per placement rather than per cause: one missing
   * ground texture is named by forty chunks, and forty identical lines say no
   * more than one does. `summarise()` reports the totals afterwards.
   */
  once(level: LogLevel, key: string, msg: string): void;
  /** How many times each deduplicated key was seen. */
  repeats(): Array<[string, number]>;
}

export function logger(scope: string): Logger {
  const seen = new Map<string, number>();

  const emit = (level: LogLevel, msg: string, args: unknown[]): void => {
    if (ORDER[level] < threshold) return;
    const line = `[${scope}] ${msg}`;
    if (level === 'error') console.error(line, ...args);
    else if (level === 'warn') console.warn(line, ...args);
    else console.log(line, ...args);
  };

  return {
    debug: (m, ...a) => emit('debug', m, a),
    info: (m, ...a) => emit('info', m, a),
    warn: (m, ...a) => emit('warn', m, a),
    error: (m, ...a) => emit('error', m, a),
    once: (level, key, msg) => {
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      if (count === 0) emit(level, msg, []);
    },
    repeats: () => [...seen.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]),
  };
}
