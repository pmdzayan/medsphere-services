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
  'inventory.listing.configured',
  'inventory.batch.received',
  'inventory.stock.adjusted',
  'inventory.reservation.created',
  'inventory.reservation.confirmed',
  'inventory.reservation.ready',
  'inventory.reservation.completed',
  'inventory.reservation.cancelled',
  'inventory.reservation.expired',
] as const;

export const AUDIT_OUTCOMES = ['SUCCEEDED', 'DENIED', 'FAILED'] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];
export type AuditMetadataValue = string | number | boolean | null;

const AUDIT_METADATA_KEYS: Readonly<Record<AuditEventType, readonly string[]>> = {
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
  'inventory.listing.configured': ['productId', 'version'],
  'inventory.batch.received': ['productId', 'quantity'],
  'inventory.stock.adjusted': ['productId', 'delta', 'onHandBefore', 'onHandAfter'],
  'inventory.reservation.created': ['itemCount', 'totalQuantity', 'expiresAt'],
  'inventory.reservation.confirmed': ['previousStatus', 'version'],
  'inventory.reservation.ready': ['previousStatus', 'version'],
  'inventory.reservation.completed': ['previousStatus', 'version', 'totalQuantity'],
  'inventory.reservation.cancelled': ['previousStatus', 'version', 'totalQuantity'],
  'inventory.reservation.expired': ['previousStatus', 'version', 'totalQuantity'],
};

export interface AuditEvent {
  readonly id: string;
  readonly eventType: AuditEventType;
  readonly outcome: AuditOutcome;
  readonly actorMembershipId: string | null;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly requestId: string | null;
  readonly metadata: Readonly<Record<string, AuditMetadataValue>>;
  readonly occurredAt: string;
}

export interface AuditEventPage {
  readonly data: AuditEvent[];
  readonly nextCursor: string | null;
}

export interface AuditEventFilters {
  readonly eventType?: AuditEventType;
  readonly outcome?: AuditOutcome;
  readonly actorMembershipId?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

const eventTypes = new Set<string>(AUDIT_EVENT_TYPES);
const outcomes = new Set<string>(AUDIT_OUTCOMES);
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAuditEventPage(value: unknown): value is AuditEventPage {
  if (!isRecord(value) || !Array.isArray(value.data)) return false;
  if (value.nextCursor !== null && !isUuid(value.nextCursor)) return false;
  return value.data.every(isAuditEvent);
}

export function isAuditEvent(value: unknown): value is AuditEvent {
  if (!isRecord(value)) return false;
  if (typeof value.eventType !== 'string' || !eventTypes.has(value.eventType)) return false;
  const eventType = value.eventType as AuditEventType;
  return (
    isUuid(value.id) &&
    typeof value.outcome === 'string' &&
    outcomes.has(value.outcome) &&
    isNullableUuid(value.actorMembershipId) &&
    isNullableBoundedString(value.resourceType, 80) &&
    isNullableBoundedString(value.resourceId, 120) &&
    isNullableBoundedString(value.requestId, 120) &&
    isAuditMetadata(eventType, value.metadata) &&
    typeof value.occurredAt === 'string' &&
    isIsoDate(value.occurredAt)
  );
}

export function toAuditSearchParams(filters: AuditEventFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.outcome) params.set('outcome', filters.outcome);
  if (filters.actorMembershipId) params.set('actorMembershipId', filters.actorMembershipId);
  if (filters.resourceType) params.set('resourceType', filters.resourceType);
  if (filters.resourceId) params.set('resourceId', filters.resourceId);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));
  return params;
}

export function auditEventLabel(eventType: AuditEventType): string {
  return eventType
    .split('.')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' · ');
}

function isAuditMetadata(
  eventType: AuditEventType,
  value: unknown,
): value is Record<string, AuditMetadataValue> {
  if (!isRecord(value)) return false;
  const allowedKeys = new Set(AUDIT_METADATA_KEYS[eventType]);
  return Object.entries(value).every(
    ([key, item]) =>
      allowedKeys.has(key) &&
      (item === null ||
        typeof item === 'boolean' ||
        (typeof item === 'number' && Number.isFinite(item)) ||
        (typeof item === 'string' && item.length <= 240)),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidV4.test(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isNullableBoundedString(value: unknown, maximum: number): value is string | null {
  return (
    value === null || (typeof value === 'string' && value.length > 0 && value.length <= maximum)
  );
}

function isIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
