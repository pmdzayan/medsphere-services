/**
 * Task 0021 — Platform administration foundation.
 *
 * Platform roles and permissions are GLOBAL. They never carry tenant scope and
 * they are deliberately NOT members of the tenant `PermissionKey` union, so a
 * tenant role can never be granted a platform permission through the accepted
 * tenant authorization boundary (the tenant PermissionsGuard / CreateRoleDto
 * validate against the tenant PERMISSION_KEYS catalogue only).
 */

export const PLATFORM_PERMISSIONS = {
  administrationRead: 'platform.administration.read',
  administrationManage: 'platform.administration.manage',
} as const;

export const PLATFORM_PERMISSION_KEYS = Object.values(PLATFORM_PERMISSIONS);
export type PlatformPermissionKey = (typeof PLATFORM_PERMISSION_KEYS)[number];

const PLATFORM_PERMISSION_KEY_SET = new Set<string>(PLATFORM_PERMISSION_KEYS);

export function isPlatformPermissionKey(value: string): value is PlatformPermissionKey {
  return PLATFORM_PERMISSION_KEY_SET.has(value);
}

export const PLATFORM_OWNER_ROLE_KEY = 'PLATFORM_OWNER';
export const PLATFORM_ADMIN_ROLE_KEY = 'PLATFORM_ADMIN';

export const PLATFORM_ROLE_KEYS = [PLATFORM_OWNER_ROLE_KEY, PLATFORM_ADMIN_ROLE_KEY] as const;
export type PlatformRoleKey = (typeof PLATFORM_ROLE_KEYS)[number];

const PLATFORM_ROLE_KEY_SET = new Set<string>(PLATFORM_ROLE_KEYS);

export function isPlatformRoleKey(value: string): value is PlatformRoleKey {
  return PLATFORM_ROLE_KEY_SET.has(value);
}

/**
 * The invitation-only HTTP flow may create/enable only PLATFORM_ADMIN for Task
 * 0021. There is no HTTP path that can create a new PLATFORM_OWNER; the owner
 * role is created only by the operator-invoked one-time bootstrap.
 */
export const INVITATION_GRANTABLE_ROLE_KEYS = [PLATFORM_ADMIN_ROLE_KEY] as const;

export const MAX_PLATFORM_ADMIN_PAGE_SIZE = 100;
export const MAX_PLATFORM_INVITATION_PAGE_SIZE = 100;
export const MAX_PLATFORM_INVITATION_TTL_DAYS = 30;
export const PLATFORM_ACCOUNT_ID_PREFIX = 'platform-account';
export const PLATFORM_SESSION_ID_PREFIX = 'platform-session';
