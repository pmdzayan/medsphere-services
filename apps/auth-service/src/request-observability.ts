import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { normalizeRequestId } from '@medsphere/common';
import type { ServiceLogger } from '@medsphere/logger';

interface ObservableHttpRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  route?: {
    path?: unknown;
  };
}

interface ObservableHttpResponse {
  readonly statusCode: number;
  setHeader(name: string, value: string): void;
  once(event: 'finish', listener: () => void): void;
}

type NextFunction = () => void;
type RequestIdGenerator = () => string;
type MonotonicClock = () => bigint;

const MAX_ROUTE_TEMPLATE_LENGTH = 256;
const MAX_METHOD_LENGTH = 16;

function normalizeGeneratedRequestId(value: string): string {
  const normalized = normalizeRequestId(value);

  if (!normalized) {
    throw new Error('Generated request ID must satisfy the MedSphere request ID contract');
  }

  return normalized;
}

export function resolveRequestId(
  inbound: string | string[] | undefined,
  generate: RequestIdGenerator = randomUUID,
): string {
  return normalizeRequestId(inbound) ?? normalizeGeneratedRequestId(generate());
}

export function safeRouteTemplate(request: ObservableHttpRequest): string | undefined {
  const routePath = request.route?.path;

  if (typeof routePath !== 'string') {
    return undefined;
  }

  const normalized = routePath.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, MAX_ROUTE_TEMPLATE_LENGTH);
}

function safeMethod(method: string | undefined): string {
  const normalized = method?.trim().toUpperCase();

  if (!normalized) {
    return 'UNKNOWN';
  }

  return normalized.slice(0, MAX_METHOD_LENGTH);
}

export function createRequestObservabilityMiddleware(
  logger: ServiceLogger,
  generateRequestId: RequestIdGenerator = randomUUID,
  clock: MonotonicClock = process.hrtime.bigint,
) {
  return (
    request: ObservableHttpRequest,
    response: ObservableHttpResponse,
    next: NextFunction,
  ): void => {
    const requestId = resolveRequestId(request.headers['x-request-id'], generateRequestId);
    const startedAt = clock();

    request.headers['x-request-id'] = requestId;
    response.setHeader('x-request-id', requestId);

    response.once('finish', () => {
      const elapsedNanoseconds = clock() - startedAt;
      const durationMs = Math.round((Number(elapsedNanoseconds) / 1_000_000) * 100) / 100;

      logger.info('HTTP request completed', {
        event: 'http_request_completed',
        requestId,
        method: safeMethod(request.method),
        route: safeRouteTemplate(request),
        statusCode: response.statusCode,
        durationMs,
      });
    });

    next();
  };
}

export function configureRequestObservability(app: INestApplication, logger: ServiceLogger): void {
  app.use(createRequestObservabilityMiddleware(logger));
}
