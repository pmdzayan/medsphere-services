import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedIdentity } from '../../auth/auth.types';

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedIdentity => {
    return context.switchToHttp().getRequest<{ user: AuthenticatedIdentity }>().user;
  },
);
