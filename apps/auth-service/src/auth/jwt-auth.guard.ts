import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PUBLIC_ENDPOINT_METADATA } from '@medsphere/common';

import { AuthenticatedIdentity } from './auth.types';
import { DEDICATED_AUTH_ENDPOINT_METADATA } from './dedicated-auth-endpoint.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): ReturnType<CanActivate['canActivate']> {
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ENDPOINT_METADATA, targets);

    if (isPublic) {
      return true;
    }

    const usesDedicatedAuthentication = this.reflector.getAllAndOverride<boolean>(
      DEDICATED_AUTH_ENDPOINT_METADATA,
      targets,
    );

    if (usesDedicatedAuthentication) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = AuthenticatedIdentity>(_error: Error | null, user: TUser | false): TUser {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
