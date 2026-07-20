import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ENDPOINT_METADATA = 'medsphere:public-endpoint';

/**
 * Explicitly opts a controller or handler out of the global authentication
 * guard. Public access is exceptional and must be visible at the route.
 */
export const PublicEndpoint = () => SetMetadata(PUBLIC_ENDPOINT_METADATA, true);
