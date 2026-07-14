import { createLogger, format, transports, Logger } from 'winston';

/**
 * Structured JSON logging shared by every service, per PROJECT_RULES.md #7
 * ("structured JSON logs with correlation IDs; never log secrets or raw
 * PII"). Callers are responsible for never passing secrets/PII into `meta` —
 * this factory can't enforce that on its own.
 */
export function createServiceLogger(serviceName: string): Logger {
  return createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
    defaultMeta: { service: serviceName },
    transports: [new transports.Console()],
  });
}
