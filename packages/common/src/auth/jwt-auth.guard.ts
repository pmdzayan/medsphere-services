import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PUBLIC_ENDPOINT_METADATA } from '../constants/common.constants';
import { AuthenticatedIdentity } from './auth.types';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): ReturnType<CanActivate['canActivate']> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ENDPOINT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic ? true : super.canActivate(context);
  }

  handleRequest<TUser = AuthenticatedIdentity>(_error: Error | null, user: TUser | false): TUser {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
