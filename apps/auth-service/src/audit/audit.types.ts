import { Prisma } from '@medsphere/database';
import { AuditEventType } from './audit.constants';

export type AuditDatabase = Pick<Prisma.TransactionClient, 'auditEvent'>;
export type AuditOutcome = 'SUCCEEDED' | 'DENIED' | 'FAILED';
export type AuditMetadataValue = string | number | boolean | null;
export type AuditMetadata = Readonly<Record<string, AuditMetadataValue>>;

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

export interface PlatformUserAuditEventInput extends AuditEventInput {
  readonly platformActorUserId: string;
}

export type SystemAuditEventInput = AuditEventInput;
