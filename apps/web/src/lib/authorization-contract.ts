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

// AUTHORIZATION_PERMISSIONS above intentionally names only the specific
// permissions this frontend makes its own UI-capability decisions on
// (e.g. "show the roles tab if the actor has rolesRead") -- every one of
// those decisions correctly keeps using that fixed set, and
// isCreateRoleRequest/isUpdateRoleRequest further below (validating
// requests this frontend itself constructs from its own rendered
// role-creation UI) also correctly keep using it. But it must not also
// be used to validate the *shape* of permission keys the backend
// actually returns: the real, authoritative permission catalogue
// (apps/auth-service/src/authorization/permission.constants.ts) already
// has 20 entries today and grows as features ship
// (EffectivePermissionsResponseDto.permissionKeys is genuinely
// string[], unrestricted, confirmed directly against the backend DTO),
// so a response validator requiring membership in this frontend's
// smaller, static list keeps rejecting perfectly valid current
// permissions -- confirmed directly: PERMISSIONS in that file already
// includes 'inventory.stock.read', 'authorization.provider-access.manage',
// and others this frontend's list has never named. The real 502 this
// caused was exactly that: a real, current, valid administrator
// permission list, rejected as "invalid response" purely for not
// appearing on an already-stale frontend allowlist.
//
// isPlausiblePermissionKey validates the actual bounded shape every
// backend permission key is defined with instead: lowercase
// dot-separated segments, hyphens allowed within a segment, at most 120
// characters (matching Permission.name's real @db.VarChar(120) column in
// packages/database/prisma/schema.prisma). This is not a new fragile
// list, hardcoded or otherwise -- it accepts any permission key shaped
// like the real ones, current or future, while still rejecting anything
// malformed.
const PERMISSION_KEY_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const PERMISSION_KEY_MAX_LENGTH = 120;

function isPlausiblePermissionKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= PERMISSION_KEY_MAX_LENGTH &&
    PERMISSION_KEY_PATTERN.test(value)
  );
}

export interface EffectivePermissionsResponse {
  permissionKeys: string[];
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
  effectivePermissions: string[];
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

export interface AssignmentResponse {
  membershipId: string;
  roleId: string;
  roleName: string;
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
  if (!hasExactKeys(value, ['roles', 'permissions', 'total', 'effectivePermissions'])) {
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
    candidate.effectivePermissions.every(isPlausiblePermissionKey) &&
    new Set(candidate.effectivePermissions).size === candidate.effectivePermissions.length
  );
}

export function isEffectivePermissionsResponse(
  value: unknown,
): value is EffectivePermissionsResponse {
  if (!hasExactKeys(value, ['permissionKeys'])) return false;
  const candidate = value as Partial<EffectivePermissionsResponse>;
  return (
    Array.isArray(candidate.permissionKeys) &&
    candidate.permissionKeys.every(isPlausiblePermissionKey) &&
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
  if (
    !hasExactKeys(value, [
      'id',
      'name',
      'description',
      'type',
      'version',
      'permissionKeys',
      'assignmentCount',
    ])
  ) {
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
    role.permissionKeys.every(isPlausiblePermissionKey) &&
    new Set(role.permissionKeys).size === role.permissionKeys.length &&
    Number.isSafeInteger(role.assignmentCount) &&
    Number(role.assignmentCount) >= 0
  );
}

export function isMembershipCatalogue(value: unknown): value is MembershipCatalogue {
  if (!hasExactKeys(value, ['data', 'total', 'limit', 'offset'])) return false;
  const candidate = value as Partial<MembershipCatalogue>;
  return (
    Array.isArray(candidate.data) &&
    candidate.data.every(isMembership) &&
    Number.isSafeInteger(candidate.total) &&
    Number(candidate.total) >= candidate.data.length &&
    Number.isSafeInteger(candidate.limit) &&
    Number(candidate.limit) > 0 &&
    Number(candidate.limit) <= 100 &&
    Number.isSafeInteger(candidate.offset) &&
    Number(candidate.offset) >= 0
  );
}

export function isMembership(value: unknown): value is Membership {
  if (!hasExactKeys(value, ['id', 'userId', 'email', 'firstName', 'lastName', 'status', 'roles']))
    return false;
  const member = value as Partial<Membership>;
  return (
    isString(member.id) &&
    isString(member.userId) &&
    isString(member.email) &&
    isString(member.firstName) &&
    isString(member.lastName) &&
    ['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED'].includes(String(member.status)) &&
    Array.isArray(member.roles) &&
    member.roles.every(
      (role) => hasExactKeys(role, ['id', 'name']) && isString(role.id) && isString(role.name),
    )
  );
}

export function isCreateRoleRequest(value: unknown): value is CreateRoleRequest {
  if (!hasExactKeys(value, ['name', 'permissionKeys'], ['description'])) return false;
  const request = value as Partial<CreateRoleRequest>;
  return (
    typeof request.name === 'string' &&
    /^[A-Z][A-Z0-9_]{2,63}$/.test(request.name) &&
    (request.description === undefined ||
      (typeof request.description === 'string' &&
        request.description.trim().length >= 1 &&
        request.description.length <= 240)) &&
    Array.isArray(request.permissionKeys) &&
    request.permissionKeys.length <= authorizationPermissionKeys.size &&
    request.permissionKeys.every(
      (permission) =>
        typeof permission === 'string' &&
        permission.length > 0 &&
        permission.length <= 120 &&
        authorizationPermissionKeys.has(permission),
    ) &&
    new Set(request.permissionKeys).size === request.permissionKeys.length
  );
}

export function isUpdateRoleRequest(value: unknown): value is UpdateRoleRequest {
  if (!hasExactKeys(value, ['version'], ['name', 'description', 'permissionKeys'])) return false;
  const request = value as Partial<UpdateRoleRequest>;
  const updateKeys = ['name', 'description', 'permissionKeys'].filter((key) => key in value);
  return (
    Number.isSafeInteger(request.version) &&
    Number(request.version) >= 1 &&
    updateKeys.length > 0 &&
    (request.name === undefined ||
      (typeof request.name === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(request.name))) &&
    (request.description === undefined ||
      (typeof request.description === 'string' &&
        request.description.trim().length >= 1 &&
        request.description.length <= 240)) &&
    (request.permissionKeys === undefined ||
      (Array.isArray(request.permissionKeys) &&
        request.permissionKeys.length <= authorizationPermissionKeys.size &&
        request.permissionKeys.every(
          (permission) =>
            typeof permission === 'string' && authorizationPermissionKeys.has(permission),
        ) &&
        new Set(request.permissionKeys).size === request.permissionKeys.length))
  );
}

export function isRoleVersionRequest(value: unknown): value is Pick<UpdateRoleRequest, 'version'> {
  if (!hasExactKeys(value, ['version'])) return false;
  return Number.isSafeInteger(value.version) && Number(value.version) >= 1;
}

export function isAssignmentResponse(value: unknown): value is AssignmentResponse {
  if (!hasExactKeys(value, ['membershipId', 'roleId', 'roleName'])) return false;
  return isString(value.membershipId) && isString(value.roleId) && isString(value.roleName);
}

function isPermission(value: unknown): value is Permission {
  if (!hasExactKeys(value, ['id', 'name', 'description'])) {
    return false;
  }
  const permission = value as Partial<Permission>;
  return isString(permission.id) && isString(permission.name) && isString(permission.description);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function hasExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in value) && keys.every((key) => allowed.has(key));
}
