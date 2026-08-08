import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedIdentity } from './auth.types';
import { PermissionKey } from './permission.constants';
import { REQUIRED_PERMISSIONS_KEY } from './decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<readonly PermissionKey[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      throw new ForbiddenException('Authorization policy is missing');
    }

    const request = context.switchToHttp().getRequest();
    const identity = request.user as AuthenticatedIdentity | undefined;
    if (!identity) {
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
