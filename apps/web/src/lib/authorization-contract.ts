export interface Permission {
  id: string;
  name: string;
  description: string;
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
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissionKeys: string[];
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
    Number(candidate.total) >= candidate.roles.length
  );
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

function isPermission(value: unknown): value is Permission {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const permission = value as Partial<Permission>;
  return isString(permission.id) && isString(permission.name) && isString(permission.description);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
