import { SetMetadata } from '@nestjs/common';

/**
 * Marks an endpoint that deliberately bypasses the normal access-JWT guard
 * because the endpoint has its own dedicated authentication guard.
 *
 * This is NOT a public endpoint. A route carrying this metadata must still
 * install its dedicated authentication guard explicitly.
 */
export const DEDICATED_AUTH_ENDPOINT_METADATA = 'auth:dedicated-endpoint';

export const DedicatedAuthEndpoint = () => SetMetadata(DEDICATED_AUTH_ENDPOINT_METADATA, true);
