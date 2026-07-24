export const AUDIT_EVENT_TYPES = [
  'authorization.role.created',
  'authorization.role.updated',
  'authorization.role.deleted',
  'authorization.assignment.added',
  'authorization.assignment.removed',
  'authorization.permission.denied',
  'authentication.session.created',
  'authentication.session.refresh.succeeded',
  'authentication.session.refresh.failed',
  'authentication.session.refresh.replayed',
  'authentication.session.logout.succeeded',
  'authentication.sessions.logout.succeeded',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const AUDIT_METADATA_KEYS = {
  'authorization.role.created': ['roleName', 'roleVersion', 'permissionCount'],
  'authorization.role.updated': ['roleName', 'roleVersion', 'permissionCount'],
  'authorization.role.deleted': ['roleName', 'roleVersion'],
  'authorization.assignment.added': ['targetMembershipId', 'roleName'],
  'authorization.assignment.removed': ['targetMembershipId', 'roleName'],
  'authorization.permission.denied': ['requiredPermissions'],
  'authentication.session.created': [],
  'authentication.session.refresh.succeeded': ['previousSessionId'],
  'authentication.session.refresh.failed': ['reason'],
  'authentication.session.refresh.replayed': ['revokedCount'],
  'authentication.session.logout.succeeded': ['revokedCount'],
  'authentication.sessions.logout.succeeded': ['revokedCount'],
} as const satisfies Record<AuditEventType, readonly string[]>;

const AUDIT_EVENT_TYPE_SET = new Set<string>(AUDIT_EVENT_TYPES);

export function isAuditEventType(value: string): value is AuditEventType {
  return AUDIT_EVENT_TYPE_SET.has(value);
}
