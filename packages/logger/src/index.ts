import { createLogger, format, transports } from 'winston';

export interface ServiceLogger {
  log(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export const LOG_REDACTED_VALUE = '[REDACTED]';
export const LOG_CIRCULAR_VALUE = '[Circular]';
export const LOG_MAX_DEPTH_VALUE = '[MaxDepth]';

const MAX_LOG_VALUE_DEPTH = 8;

function normalizeSensitiveKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function isSensitiveLogKey(key: string): boolean {
  const normalized = normalizeSensitiveKey(key);

  if (
    normalized === 'authorization' ||
    normalized === 'cookie' ||
    normalized === 'setcookie' ||
    normalized === 'password' ||
    normalized === 'passwordhash' ||
    normalized === 'passphrase' ||
    normalized === 'otp' ||
    normalized === 'apikey' ||
    normalized === 'privatekey' ||
    normalized === 'databaseurl' ||
    normalized === 'redisurl' ||
    normalized === 'redisclusterurl' ||
    normalized === 'smtpurl' ||
    normalized === 'connectionstring'
  ) {
    return true;
  }

  return (
    normalized.endsWith('password') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('token') ||
    normalized.endsWith('credential') ||
    normalized.endsWith('credentials') ||
    normalized.endsWith('privatekey') ||
    normalized.endsWith('apikey') ||
    normalized.endsWith('otp')
  );
}

export function sanitizeLogString(value: string): string {
  return value
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+={0,2}/gi, '$1 [REDACTED]')
    .replace(/\b(Basic)\s+[A-Za-z0-9+/]+={0,2}/gi, '$1 [REDACTED]')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(/\b(password|passphrase|secret|token|api[_-]?key|otp)=([^&\s]+)/gi, '$1=[REDACTED]');
}

export function redactLogValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (depth > MAX_LOG_VALUE_DEPTH) {
    return LOG_MAX_DEPTH_VALUE;
  }

  if (typeof value === 'string') {
    return sanitizeLogString(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }

  if (value instanceof Error) {
    if (seen.has(value)) {
      return LOG_CIRCULAR_VALUE;
    }

    seen.add(value);

    const redactedError: Record<string, unknown> = {
      name: sanitizeLogString(value.name),
      message: sanitizeLogString(value.message),
    };

    if (value.stack) {
      redactedError.stack = sanitizeLogString(value.stack);
    }

    if ('cause' in value && value.cause !== undefined) {
      redactedError.cause = redactLogValue(value.cause, seen, depth + 1);
    }

    return redactedError;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return LOG_CIRCULAR_VALUE;
    }

    seen.add(value);
    return value.map((item) => redactLogValue(item, seen, depth + 1));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return LOG_CIRCULAR_VALUE;
    }

    seen.add(value);

    const result: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      result[key] = isSensitiveLogKey(key)
        ? LOG_REDACTED_VALUE
        : redactLogValue(nestedValue, seen, depth + 1);
    }

    return result;
  }

  return sanitizeLogString(String(value));
}

export function redactLogInfo<T extends Record<string, unknown>>(info: T): T {
  const mutableInfo: Record<string, unknown> = info;

  for (const key of Object.keys(mutableInfo)) {
    mutableInfo[key] = isSensitiveLogKey(key)
      ? LOG_REDACTED_VALUE
      : redactLogValue(mutableInfo[key]);
  }

  return info;
}

const privacyRedactionFormat = format((info) => redactLogInfo(info));

export function createServiceLogger(serviceName: string): ServiceLogger {
  const logger = createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      privacyRedactionFormat(),
      format.json(),
    ),
    defaultMeta: {
      service: serviceName,
    },
    transports: [new transports.Console()],
  });

  return {
    log: (message, meta) => logger.info(message, meta),
    info: (message, meta) => logger.info(message, meta),
    warn: (message, meta) => logger.warn(message, meta),
    debug: (message, meta) => logger.debug(message, meta),
    error: (message, error, meta) =>
      logger.error(message, {
        ...meta,
        error,
      }),
  };
}
