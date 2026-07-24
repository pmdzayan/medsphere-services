import { RequestMetadata } from './auth.types';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,120}$/;

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
    requestId: requestId && SAFE_REQUEST_ID.test(requestId) ? requestId : undefined,
  };
}
