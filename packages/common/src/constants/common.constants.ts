import { SetMetadata, INestApplication } from '@nestjs/common';
import { normalizeRequestId as normalizeRequestIdHttp } from '../http/request-id';
import {
  configureHttpSecurityHeaders as configureHttpSecurityHeadersHttp,
  HttpSecurityHeaderOptions,
} from '../http/security-headers';

export const PUBLIC_ENDPOINT_METADATA = 'isPublicEndpoint';

export const PublicEndpoint = () => SetMetadata(PUBLIC_ENDPOINT_METADATA, true);

export function normalizeRequestId(requestId?: unknown): string | undefined {
  return normalizeRequestIdHttp(requestId);
}

export function configureHttpSecurityHeaders(
  app: INestApplication,
  options?: HttpSecurityHeaderOptions,
): void {
  configureHttpSecurityHeadersHttp(app, options);
}
