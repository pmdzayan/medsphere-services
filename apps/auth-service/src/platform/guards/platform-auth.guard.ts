import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PlatformAuthenticatedIdentity } from '../platform.types';

@Injectable()
export class PlatformAuthGuard extends AuthGuard('platform-jwt') {
  handleRequest<TUser = PlatformAuthenticatedIdentity>(
    _error: Error | null,
    user: TUser | false,
  ): TUser {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    return user;
  }

  canActivate(context: ExecutionContext): ReturnType<CanActivate['canActivate']> {
    return super.canActivate(context);
  }
}
