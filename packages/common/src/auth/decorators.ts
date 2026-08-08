import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { PUBLIC_ENDPOINT_METADATA } from '../constants/common.constants';
import { PermissionKey } from './permission.constants';

export const Public = () => SetMetadata(PUBLIC_ENDPOINT_METADATA, true);

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const CurrentIdentity = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});

export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.tenantId;
});
