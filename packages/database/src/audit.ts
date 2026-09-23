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
  'authorization.membership.suspended',
  'authorization.membership.revoked',
  'platform.authentication.session.created',
  'platform.authentication.session.refresh.succeeded',
  'platform.authentication.session.refresh.failed',
  'platform.authentication.session.refresh.replayed',
  'platform.authentication.session.logout.succeeded',
  'platform.authentication.session.locked',
  'platform.authentication.session.unlocked',
  'platform.invitation.created',
  'platform.invitation.revoked',
  'platform.invitation.accepted',
  'platform.role.assigned',
  'platform.admin.suspended',
  'platform.admin.reactivated',
  'platform.session.revoked',
  'platform.owner.bootstrap',
  'authentication.session.created',
  'authentication.session.refresh.succeeded',
  'authentication.session.refresh.failed',
  'authentication.session.refresh.replayed',
  'authentication.session.logout.succeeded',
  'authentication.sessions.logout.succeeded',
  'authentication.session.locked',
  'authentication.session.unlocked',
  'authentication.session.unlock.failed',
  'authentication.session.logout.locked',
  'authentication.session.switched',
  'authentication.session.reauthenticated',
  'authentication.verification.completed',
  'authentication.account.activated',
  'authentication.otp.requested',
  'authentication.organization.join.requested',
  'authentication.organization.join.code.rejected',
  'authentication.organization.join.code.issued',
  'authentication.organization.join.code.revoked',
  'privacy.consent.granted',
  'privacy.consent.withdrawn',
  'privacy.preference.changed',
  'compliance.policy.revised',
  'compliance.legal-hold.placed',
  'compliance.legal-hold.released',
  'compliance.policy.evaluated',
  'compliance.retention-policy.configured',
  'compliance.legal-hold.placed',
  'compliance.legal-hold.released',
  'compliance.subject-request.created',
  'compliance.subject-request.blocked',
  'compliance.subject-request.approved',
  'compliance.subject-request.rejected',
  'compliance.subject-request.completed',
  'inventory.listing.configured',
  /// Candidate Task 0032 (pre-0031): a global personal-identity
  /// action, always written via appendPlatformUser -- see
  /// PatientProfileService.
  'patient.profile.updated',
  'inventory.batch.received',
  'inventory.stock.adjusted',
  'inventory.stock.transferred',
  'inventory.stock.damaged',
  'inventory.batch.expired',
  'inventory.batch.quarantined',
  'inventory.batch.recalled',
  'inventory.exception.requested',
  'inventory.exception.approved',
  'inventory.exception.rejected',
  'inventory.reservation.created',
  'inventory.reservation.confirmed',
  'inventory.reservation.ready',
  'inventory.reservation.completed',
  'inventory.reservation.cancelled',
  'inventory.reservation.expired',
  'inventory.availability-request.responded',
  'inventory.availability-request.preference.configured',
  'inventory.import.staged',
  'inventory.import.applied',
  'billing.pos.fiscal-profile.configured',
  'billing.pos.inventory-fiscal-profile.configured',
  'billing.pos.sale.completed',
  'billing.pos.invoice.reprinted',
  'billing.pos.sale.voided',
  'billing.pos.return.completed',
  // Task 0039 (PROVISIONAL): pharmacy onboarding & verification closure.
  'pharmacy.verification.submitted',
  'pharmacy.verification.resubmitted',
  'pharmacy.verification.review-started',
  'pharmacy.verification.approved',
  'pharmacy.verification.rejected',
  'pharmacy.verification.suspended',
  'pharmacy.verification.expired',
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
  'authorization.membership.suspended': ['targetMembershipId', 'previousStatus', 'resultingStatus'],
  'authorization.membership.revoked': ['targetMembershipId', 'previousStatus', 'resultingStatus'],
  'platform.authentication.session.created': [],
  'platform.authentication.session.refresh.succeeded': ['previousPlatformSessionId'],
  'platform.authentication.session.refresh.failed': ['reason'],
  'platform.authentication.session.refresh.replayed': ['revokedCount'],
  'platform.authentication.session.logout.succeeded': ['revokedCount'],
  'platform.authentication.session.locked': ['reason'],
  'platform.authentication.session.unlocked': ['method'],
  'platform.invitation.created': ['targetRoleKey', 'invitationId'],
  'platform.invitation.revoked': ['targetRoleKey', 'invitationId'],
  'platform.invitation.accepted': ['targetRoleKey', 'invitationId'],
  'platform.role.assigned': ['targetPlatformUserId', 'roleKey'],
  'platform.admin.suspended': ['targetPlatformUserId', 'revokedSessionCount'],
  'platform.admin.reactivated': ['targetPlatformUserId'],
  'platform.session.revoked': ['revokedSessionCount'],
  'platform.owner.bootstrap': ['targetPlatformUserId', 'targetRoleKey'],
  'authentication.session.created': [],
  'authentication.session.refresh.succeeded': ['previousSessionId'],
  'authentication.session.refresh.failed': ['reason'],
  'authentication.session.refresh.replayed': ['revokedCount'],
  'authentication.session.logout.succeeded': ['revokedCount'],
  'authentication.sessions.logout.succeeded': ['revokedCount'],
  'authentication.session.locked': ['reason'],
  'authentication.session.unlocked': ['method'],
  'authentication.session.unlock.failed': ['reason'],
  'authentication.session.logout.locked': ['revokedCount'],
  'authentication.session.switched': ['previousSessionId'],
  'authentication.session.reauthenticated': ['method'],
  'authentication.verification.completed': ['method', 'provider', 'status', 'age18Plus'],
  'authentication.account.activated': ['verificationPolicy'],
  'authentication.otp.requested': [],
  'authentication.organization.join.requested': ['organizationType'],
  'authentication.organization.join.code.rejected': ['reason'],
  'authentication.organization.join.code.issued': ['expires'],
  'authentication.organization.join.code.revoked': ['previousVersion'],
  'privacy.consent.granted': ['category'],
  'privacy.consent.withdrawn': ['category'],
  'privacy.preference.changed': ['preferenceKeys'],
  'compliance.policy.revised': [
    'dataClass',
    'scope',
    'version',
    'expiryDisposition',
    'subjectRequestDisposition',
  ],
  'compliance.legal-hold.placed': ['dataClass', 'reasonCode', 'scope'],
  'compliance.legal-hold.released': ['dataClass', 'reasonCode', 'scope', 'resultingVersion'],
  'compliance.policy.evaluated': [
    'dataClass',
    'purpose',
    'context',
    'decision',
    'effectiveDisposition',
  ],
  'compliance.retention-policy.configured': [
    'dataClass',
    'disposition',
    'retentionDays',
    'isEnabled',
    'version',
  ],
  'compliance.legal-hold.placed': ['dataClass', 'reasonCode', 'scope'],
  'compliance.legal-hold.released': ['dataClass', 'scope', 'version'],
  'compliance.subject-request.created': ['dataClass', 'action', 'scope'],
  'compliance.subject-request.blocked': ['dataClass', 'action', 'reasonCode', 'scope'],
  'compliance.subject-request.approved': ['dataClass', 'action', 'scope', 'version'],
  'compliance.subject-request.rejected': ['dataClass', 'action', 'scope', 'version'],
  'compliance.subject-request.completed': ['dataClass', 'action', 'scope', 'version'],
  'inventory.listing.configured': ['productId', 'version'],
  'patient.profile.updated': ['fieldsChanged'],
  'inventory.batch.received': ['productId', 'quantity'],
  'inventory.stock.adjusted': ['productId', 'delta', 'onHandBefore', 'onHandAfter'],
  'inventory.stock.transferred': [
    'sourceProviderId',
    'destinationProviderId',
    'productId',
    'quantity',
  ],
  'inventory.stock.damaged': ['productId', 'quantity', 'onHandBefore', 'onHandAfter'],
  'inventory.batch.expired': [
    'productId',
    'onHandQuantity',
    'affectedReservations',
    'releasedUnits',
    'resultingVersion',
  ],
  'inventory.batch.quarantined': [
    'productId',
    'reasonCode',
    'onHandQuantity',
    'affectedReservations',
    'releasedUnits',
    'resultingVersion',
  ],
  'inventory.batch.recalled': [
    'productId',
    'reasonCode',
    'onHandQuantity',
    'affectedReservations',
    'releasedUnits',
    'resultingVersion',
  ],
  'inventory.exception.requested': ['providerId', 'action', 'quantity', 'requestedVersion'],
  'inventory.exception.approved': [
    'providerId',
    'action',
    'quantity',
    'onHandBefore',
    'onHandAfter',
    'resultingVersion',
  ],
  'inventory.exception.rejected': ['providerId', 'action', 'quantity'],
  'inventory.reservation.created': ['itemCount', 'totalQuantity', 'expiresAt'],
  'inventory.reservation.confirmed': ['previousStatus', 'version'],
  'inventory.reservation.ready': ['previousStatus', 'version'],
  'inventory.reservation.completed': ['previousStatus', 'version', 'totalQuantity'],
  'inventory.reservation.cancelled': ['previousStatus', 'version', 'totalQuantity', 'cause'],
  'inventory.reservation.expired': ['previousStatus', 'version', 'totalQuantity', 'cause'],
  'inventory.availability-request.responded': ['outcome'],
  'inventory.availability-request.preference.configured': [
    'liveRequestsEnabled',
    'timezone',
    'quietHoursStartMinute',
    'quietHoursEndMinute',
  ],
  'inventory.import.staged': [
    'providerId',
    'rowCount',
    'validRowCount',
    'invalidRowCount',
    'sourceFormat',
  ],
  'inventory.import.applied': ['providerId', 'rowCount', 'totalQuantity'],
  'billing.pos.fiscal-profile.configured': ['providerId', 'registrationType', 'version'],
  'billing.pos.inventory-fiscal-profile.configured': ['providerId', 'productId', 'version'],
  'billing.pos.sale.completed': [
    'providerId',
    'lineCount',
    'totalQuantity',
    'grandTotal',
    'invoiceNumber',
    'reservationId',
  ],
  'billing.pos.invoice.reprinted': ['providerId', 'saleId', 'invoiceNumber'],
  'billing.pos.sale.voided': ['providerId', 'lineCount', 'totalQuantity', 'invoiceNumber'],
  'billing.pos.return.completed': [
    'providerId',
    'saleId',
    'lineCount',
    'totalQuantity',
    'refundTotal',
  ],
  // Task 0039 (PROVISIONAL): no document/evidence content, license
  // numbers, government references, or reviewer notes are ever
  // included -- only bounded structural identifiers and status
  // transitions.
  'pharmacy.verification.submitted': ['verificationId', 'providerId'],
  'pharmacy.verification.resubmitted': ['verificationId', 'providerId', 'previousVerificationId'],
  'pharmacy.verification.review-started': ['verificationId', 'providerId', 'previousStatus'],
  'pharmacy.verification.approved': ['verificationId', 'providerId', 'previousStatus'],
  'pharmacy.verification.rejected': ['verificationId', 'providerId', 'previousStatus'],
  'pharmacy.verification.suspended': ['verificationId', 'providerId', 'previousStatus'],
  'pharmacy.verification.expired': ['verificationId', 'providerId', 'previousStatus'],
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
  readonly occurredAt?: Date;
}

export interface TenantUserAuditEventInput extends AuditEventInput {
  readonly tenantId: string;
  readonly actorMembershipId: string;
  /** Task 0019: exact authenticated user responsible for the action. Must come
   *  only from trusted server-side authentication context, never client input. */
  readonly actorUserId: string;
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
    if (typeof input.actorUserId !== 'string' || input.actorUserId.length === 0) {
      throw new Error('Authenticated user id is required for TENANT_USER audit events');
    }
    await database.auditEvent.create({
      data: {
        id: randomUUID(),
        ...this.baseData(input),
        scope: 'TENANT',
        actorType: 'TENANT_USER',
        tenantId: input.tenantId,
        actorMembershipId: input.actorMembershipId,
        actorUserId: input.actorUserId,
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
      occurredAt: this.optionalDate(input.occurredAt),
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

  private optionalDate(value: Date | undefined): Date | undefined {
    if (value === undefined) return undefined;
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new Error('Invalid audit occurrence timestamp');
    }
    return value;
  }
}
