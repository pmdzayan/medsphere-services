import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PlatformAuthenticatedIdentity } from '../platform.types';

export const CurrentPlatformIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PlatformAuthenticatedIdentity => {
    return context.switchToHttp().getRequest<{ user: PlatformAuthenticatedIdentity }>().user;
  },
);
