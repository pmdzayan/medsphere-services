export interface Permission {
  id: string;
  name: string;
  description: string;
}

export const AUTHORIZATION_PERMISSIONS = {
  rolesRead: 'authorization.roles.read',
  rolesCreate: 'authorization.roles.create',
  rolesUpdate: 'authorization.roles.update',
  rolesDelete: 'authorization.roles.delete',
  permissionsRead: 'authorization.permissions.read',
  assignmentsRead: 'authorization.assignments.read',
  assignmentsManage: 'authorization.assignments.manage',
  auditEventsRead: 'audit.events.read',
} as const;

export type AuthorizationPermission =
  (typeof AUTHORIZATION_PERMISSIONS)[keyof typeof AUTHORIZATION_PERMISSIONS];

const authorizationPermissionKeys = new Set<string>(Object.values(AUTHORIZATION_PERMISSIONS));

export interface EffectivePermissionsResponse {
  permissionKeys: AuthorizationPermission[];
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  type: 'SYSTEM' | 'TENANT';
  version: number;
  permissionKeys: string[];
  assignmentCount: number;
}

export interface AuthorizationCatalogue {
  roles: Role[];
  permissions: Permission[];
  total: number;
  effectivePermissions: AuthorizationPermission[];
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissionKeys: string[];
}

export interface UpdateRoleRequest {
  version: number;
  name?: string;
  description?: string;
  permissionKeys?: string[];
}

export interface MembershipRole {
  id: string;
  name: string;
}

export interface Membership {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  roles: MembershipRole[];
}

export interface MembershipCatalogue {
  data: Membership[];
  total: number;
  limit: number;
  offset: number;
}

export type CreateRoleErrors = Partial<Record<'name' | 'description' | 'permissionKeys', string>>;

export function normalizeRoleName(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function validateCreateRole(
  input: CreateRoleRequest,
  allowedPermissionKeys: readonly string[],
): CreateRoleErrors {
  const errors: CreateRoleErrors = {};
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(input.name)) {
    errors.name = 'Use 3–64 uppercase letters, numbers, and underscores.';
  }
  if (input.description !== undefined) {
    const description = input.description.trim();
    if (description.length < 1 || description.length > 240) {
      errors.description = 'Description must be between 1 and 240 characters.';
    }
  }
  const uniqueKeys = new Set(input.permissionKeys);
  const allowed = new Set(allowedPermissionKeys);
  if (
    uniqueKeys.size !== input.permissionKeys.length ||
    input.permissionKeys.some((permission) => !allowed.has(permission))
  ) {
    errors.permissionKeys = 'Select permissions from the current catalogue.';
  }
  return errors;
}

export function isAuthorizationCatalogue(value: unknown): value is AuthorizationCatalogue {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<AuthorizationCatalogue>;
  return (
    Array.isArray(candidate.roles) &&
    candidate.roles.every(isRole) &&
    Array.isArray(candidate.permissions) &&
    candidate.permissions.every(isPermission) &&
    Number.isSafeInteger(candidate.total) &&
    Number(candidate.total) >= candidate.roles.length &&
    Array.isArray(candidate.effectivePermissions) &&
    candidate.effectivePermissions.every(isAuthorizationPermission) &&
    new Set(candidate.effectivePermissions).size === candidate.effectivePermissions.length
  );
}

export function isEffectivePermissionsResponse(
  value: unknown,
): value is EffectivePermissionsResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EffectivePermissionsResponse>;
  return (
    Array.isArray(candidate.permissionKeys) &&
    candidate.permissionKeys.every(isAuthorizationPermission) &&
    new Set(candidate.permissionKeys).size === candidate.permissionKeys.length
  );
}

export function hasAuthorizationPermission(
  catalogue: Pick<AuthorizationCatalogue, 'effectivePermissions'>,
  permission: AuthorizationPermission,
): boolean {
  return catalogue.effectivePermissions.includes(permission);
}

export function isRole(value: unknown): value is Role {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const role = value as Partial<Role>;
  return (
    isString(role.id) &&
    isString(role.name) &&
    (role.description === null || typeof role.description === 'string') &&
    (role.type === 'SYSTEM' || role.type === 'TENANT') &&
    Number.isSafeInteger(role.version) &&
    Number(role.version) >= 1 &&
    Array.isArray(role.permissionKeys) &&
    role.permissionKeys.every(isString) &&
    Number.isSafeInteger(role.assignmentCount) &&
    Number(role.assignmentCount) >= 0
  );
}

export function isMembershipCatalogue(value: unknown): value is MembershipCatalogue {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MembershipCatalogue>;
  return (
    Array.isArray(candidate.data) &&
    candidate.data.every(isMembership) &&
    Number.isSafeInteger(candidate.total) &&
    Number(candidate.total) >= candidate.data.length &&
    Number.isSafeInteger(candidate.limit) &&
    Number.isSafeInteger(candidate.offset)
  );
}

export function isMembership(value: unknown): value is Membership {
  if (!value || typeof value !== 'object') return false;
  const member = value as Partial<Membership>;
  return (
    isString(member.id) &&
    isString(member.userId) &&
    isString(member.email) &&
    isString(member.firstName) &&
    isString(member.lastName) &&
    ['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED'].includes(String(member.status)) &&
    Array.isArray(member.roles) &&
    member.roles.every((role) =>
      Boolean(role && typeof role === 'object' && isString(role.id) && isString(role.name)),
    )
  );
}

function isPermission(value: unknown): value is Permission {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const permission = value as Partial<Permission>;
  return isString(permission.id) && isString(permission.name) && isString(permission.description);
}

function isAuthorizationPermission(value: unknown): value is AuthorizationPermission {
  return typeof value === 'string' && authorizationPermissionKeys.has(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
