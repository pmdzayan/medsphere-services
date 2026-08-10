import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const AUDIT_EVENT_TYPES = [
  'authorization.role.created',
  'authorization.role.updated',
  'authorization.role.deleted',
  'authorization.assignment.added',
  'authorization.assignment.removed',
  'authorization.provider-access.added',
  'authorization.provider-access.removed',
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
  'inventory.stock.transferred',
  'inventory.stock.damaged',
  'inventory.reservation.created',
  'inventory.reservation.confirmed',
  'inventory.reservation.ready',
  'inventory.reservation.completed',
  'inventory.reservation.cancelled',
  'inventory.reservation.expired',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];
export type AuditDatabase = Pick<Prisma.TransactionClient, 'auditEvent'>;
export type AuditOutcome = 'SUCCEEDED' | 'DENIED' | 'FAILED';
export type AuditMetadataValue = string | number | boolean | null;
export type AuditMetadata = Readonly<Record<string, AuditMetadataValue>>;

export const AUDIT_METADATA_KEYS = {
  'authorization.role.created': ['roleName', 'roleVersion', 'permissionCount'],
  'authorization.role.updated': ['roleName', 'roleVersion', 'permissionCount'],
  'authorization.role.deleted': ['roleName', 'roleVersion'],
  'authorization.assignment.added': ['targetMembershipId', 'roleName'],
  'authorization.assignment.removed': ['targetMembershipId', 'roleName'],
  'authorization.provider-access.added': ['targetMembershipId', 'providerId'],
  'authorization.provider-access.removed': ['targetMembershipId', 'providerId'],
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
  'inventory.stock.transferred': [
    'sourceProviderId',
    'destinationProviderId',
    'productId',
    'quantity',
  ],
  'inventory.stock.damaged': ['productId', 'quantity', 'onHandBefore', 'onHandAfter'],
  'inventory.reservation.created': ['itemCount', 'totalQuantity', 'expiresAt'],
  'inventory.reservation.confirmed': ['previousStatus', 'version'],
  'inventory.reservation.ready': ['previousStatus', 'version'],
  'inventory.reservation.completed': ['previousStatus', 'version', 'totalQuantity'],
  'inventory.reservation.cancelled': ['previousStatus', 'version', 'totalQuantity'],
  'inventory.reservation.expired': ['previousStatus', 'version', 'totalQuantity'],
} as const satisfies Record<AuditEventType, readonly string[]>;

const AUDIT_EVENT_TYPE_SET = new Set<string>(AUDIT_EVENT_TYPES);
const APPLICATION_METADATA_LIMIT_BYTES = 12 * 1024;
const FORBIDDEN_METADATA_KEY =
  /(password|credential|token|secret|authorization|email|phone|medical|clinical|payload|snapshot|oldvalue|newvalue)/i;

export interface AuditRequestContext {
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

interface AuditEventInput {
  readonly eventType: AuditEventType;
  readonly outcome: AuditOutcome;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly metadata?: AuditMetadata;
  readonly request?: AuditRequestContext;
}

export interface TenantUserAuditEventInput extends AuditEventInput {
  readonly tenantId: string;
  readonly actorMembershipId: string;
}

export interface TenantSystemAuditEventInput extends AuditEventInput {
  readonly tenantId: string;
}

export interface PlatformUserAuditEventInput extends AuditEventInput {
  readonly platformActorUserId: string;
}

export type SystemAuditEventInput = AuditEventInput;

export function isAuditEventType(value: string): value is AuditEventType {
  return AUDIT_EVENT_TYPE_SET.has(value);
}

export function validateAuditMetadata(eventType: string, metadata: unknown): AuditMetadata {
  if (!isAuditEventType(eventType)) {
    throw new Error('Unsupported audit event type');
  }
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata) ||
    Object.getPrototypeOf(metadata) !== Object.prototype
  ) {
    throw new Error('Audit metadata must be a plain object');
  }

  const allowedKeys = new Set<string>(AUDIT_METADATA_KEYS[eventType]);
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowedKeys.has(key) || FORBIDDEN_METADATA_KEY.test(key)) {
      throw new Error('Audit metadata contains an unsupported key');
    }
    validateMetadataValue(value);
  }

  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > APPLICATION_METADATA_LIMIT_BYTES) {
    throw new Error('Audit metadata exceeds the application size limit');
  }
  return metadata as AuditMetadata;
}

function validateMetadataValue(value: unknown): asserts value is AuditMetadataValue {
  if (value === null || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return;
  }
  if (typeof value === 'string' && value.length <= 240) {
    return;
  }
  throw new Error('Audit metadata values must be bounded scalars');
}

export class AuditWriter {
  async appendTenantUser(database: AuditDatabase, input: TenantUserAuditEventInput): Promise<void> {
    await database.auditEvent.create({
      data: {
        id: randomUUID(),
        ...this.baseData(input),
        scope: 'TENANT',
        actorType: 'TENANT_USER',
        tenantId: input.tenantId,
        actorMembershipId: input.actorMembershipId,
      },
      select: { id: true },
    });
  }

  async appendTenantSystem(
    database: AuditDatabase,
    input: TenantSystemAuditEventInput,
  ): Promise<void> {
    await database.auditEvent.create({
      data: {
        id: randomUUID(),
        ...this.baseData(input),
        scope: 'TENANT',
        actorType: 'SYSTEM',
        tenantId: input.tenantId,
      },
      select: { id: true },
    });
  }

  async appendPlatformUser(
    database: AuditDatabase,
    input: PlatformUserAuditEventInput,
  ): Promise<void> {
    await database.auditEvent.create({
      data: {
        id: randomUUID(),
        ...this.baseData(input),
        scope: 'PLATFORM',
        actorType: 'PLATFORM_USER',
        platformActorUserId: input.platformActorUserId,
      },
      select: { id: true },
    });
  }

  async appendSystem(database: AuditDatabase, input: SystemAuditEventInput): Promise<void> {
    await database.auditEvent.create({
      data: {
        id: randomUUID(),
        ...this.baseData(input),
        scope: 'PLATFORM',
        actorType: 'SYSTEM',
      },
      select: { id: true },
    });
  }

  private baseData(
    input:
      | TenantUserAuditEventInput
      | TenantSystemAuditEventInput
      | PlatformUserAuditEventInput
      | SystemAuditEventInput,
  ) {
    const hasResourceType = input.resourceType !== undefined;
    const hasResourceId = input.resourceId !== undefined;
    if (hasResourceType !== hasResourceId) {
      throw new Error('Audit resource type and identifier must be provided together');
    }

    return {
      eventType: input.eventType,
      outcome: input.outcome,
      resourceType: this.optionalBounded(input.resourceType, 80, 'resource type'),
      resourceId: this.optionalBounded(input.resourceId, 120, 'resource identifier'),
      requestId: this.optionalBounded(input.request?.requestId, 120, 'request identifier'),
      ipAddress: input.request?.ipAddress,
      userAgent: this.optionalBounded(input.request?.userAgent, 512, 'user agent'),
      metadata: validateAuditMetadata(input.eventType, input.metadata ?? {}),
    };
  }

  private optionalBounded(
    value: string | undefined,
    maximum: number,
    label: string,
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value.length === 0 || value.length > maximum) {
      throw new Error(`Invalid audit ${label}`);
    }
    return value;
  }
}
