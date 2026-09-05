import { SetMetadata } from '@nestjs/common';
import { isPlatformPermissionKey, PlatformPermissionKey } from '../platform.constants';

export const REQUIRED_PLATFORM_PERMISSIONS_KEY = 'medsphere.required-platform-permissions';

export function RequirePlatformPermissions(...permissions: readonly PlatformPermissionKey[]) {
  if (
    permissions.length === 0 ||
    permissions.some((permission) => !isPlatformPermissionKey(permission))
  ) {
    throw new Error('RequirePlatformPermissions received an empty or unknown permission');
  }
  return SetMetadata(REQUIRED_PLATFORM_PERMISSIONS_KEY, [...permissions]);
}
