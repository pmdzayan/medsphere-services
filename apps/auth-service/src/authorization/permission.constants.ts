export const PERMISSIONS = {
  rolesRead: 'authorization.roles.read',
  rolesCreate: 'authorization.roles.create',
  rolesUpdate: 'authorization.roles.update',
  rolesDelete: 'authorization.roles.delete',
  permissionsRead: 'authorization.permissions.read',
  assignmentsRead: 'authorization.assignments.read',
  assignmentsManage: 'authorization.assignments.manage',
  auditEventsRead: 'audit.events.read',
} as const;

export const PERMISSION_KEYS = Object.values(PERMISSIONS);
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const PERMISSION_KEY_SET = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEY_SET.has(value);
}

export const TENANT_ADMINISTRATOR_ROLE = 'TENANT_ADMINISTRATOR';
