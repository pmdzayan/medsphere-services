import type { AuditEventType } from './audit.constants';

const REQUIRED_METADATA_KEYS: Record<string, readonly string[]> = {
  'auth.login.success': ['email'],
  'auth.login.failure': ['email', 'reason'],
  'auth.login.rate_limited': ['email'],
  'auth.logout.success': [],
  'auth.password.changed': [],
  'auth.token.refreshed': [],
  'auth.token.refresh_failed': ['reason'],
  'auth.session.revoked': ['revokedSessionId'],
  'auth.session.revoked_all': ['count'],
  'authorization.role.created': ['roleId', 'roleCode', 'name'],
  'authorization.role.updated': ['roleId', 'changes'],
  'authorization.role.deleted': ['roleId', 'roleCode'],
  'authorization.permission.assigned': ['roleId', 'permissionKey'],
  'authorization.permission.unassigned': ['roleId', 'permissionKey'],
  'authorization.permission.denied': ['requiredPermissions'],
  'authorization.assignment.created': ['membershipId', 'roleId'],
  'authorization.assignment.revoked': ['membershipId', 'roleId'],
};

export function validateAuditMetadata(
  eventType: AuditEventType,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const requiredKeys = REQUIRED_METADATA_KEYS[eventType] ?? [];
  for (const key of requiredKeys) {
    if (!(key in metadata) || metadata[key] === undefined || metadata[key] === null) {
      throw new Error(`Missing required audit metadata key "${key}" for event "${eventType}"`);
    }
  }
  return metadata;
}
