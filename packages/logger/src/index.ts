import { createLogger, format, transports } from 'winston';

export interface ServiceLogger {
  log(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export function createServiceLogger(serviceName: string): ServiceLogger {
  const logger = createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
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
