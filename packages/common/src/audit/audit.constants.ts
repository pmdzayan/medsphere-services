export const AUDIT_EVENT_TYPES = [
  'auth.login.success',
  'auth.login.failure',
  'auth.login.rate_limited',
  'auth.logout.success',
  'auth.password.changed',
  'auth.token.refreshed',
  'auth.token.refresh_failed',
  'auth.session.revoked',
  'auth.session.revoked_all',
  'authorization.role.created',
  'authorization.role.updated',
  'authorization.role.deleted',
  'authorization.permission.assigned',
  'authorization.permission.unassigned',
  'authorization.permission.denied',
  'authorization.assignment.created',
  'authorization.assignment.revoked',
  'authorization.assignment.added',
  'authorization.assignment.removed',
  'inventory.aggregate.viewed',
  'inventory.batch.created',
  'inventory.stock.adjusted',
  'medicine.reservation.allocated',
  'medicine.reservation.completed',
  'medicine.reservation.cancelled',
  'medicine.reservation.expired',
  'inventory.expiry.viewed',
  'inventory.expiry.scanned',
  'inventory.expiry.batch.expired',
  'inventory.expiry.batch.flagged',
  'inventory.expiry.scan.completed',
  'inventory.adjustment.created',
  'inventory.adjustment.damaged',
  'inventory.adjustment.lost',
  'inventory.adjustment.correction',
  'inventory.adjustment.expired',
  'inventory.adjustment.cycle-count',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

const AUDIT_EVENT_TYPE_SET = new Set<string>(AUDIT_EVENT_TYPES);

export function isAuditEventType(value: string): value is AuditEventType {
  return AUDIT_EVENT_TYPE_SET.has(value);
}
