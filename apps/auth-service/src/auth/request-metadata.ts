import { normalizeRequestId } from '@medsphere/common';
import { RequestMetadata } from './auth.types';

export interface MetadataHttpRequest {
  readonly ip?: string;
  get(name: string): string | undefined;
}

export function extractRequestMetadata(request: MetadataHttpRequest): RequestMetadata {
  const requestId = request.get('x-request-id');
  const userAgent = request.get('user-agent');

  return {
    ipAddress: request.ip,
    userAgent: userAgent?.slice(0, 512),
    requestId: normalizeRequestId(requestId),
  };
}
