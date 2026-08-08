import type { AuditEventType } from './audit.constants';

export type AuditOutcome = 'SUCCESS' | 'SUCCEEDED' | 'DENIED' | 'FAILED';

export interface AuditDatabase {
  readonly auditEvent: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(args: any): Promise<{ id: string }>;
  };
}

export interface RequestAuditMetadata {
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export interface TenantUserAuditEventInput {
  readonly tenantId: string;
  readonly actorMembershipId: string;
  readonly eventType: AuditEventType;
  readonly outcome: AuditOutcome;
  readonly resourceType?: string;
  readonly resourceId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly metadata?: Record<string, any>;
  readonly request?: RequestAuditMetadata;
}

export interface TenantSystemAuditEventInput {
  readonly tenantId: string;
  readonly eventType: AuditEventType;
  readonly outcome: AuditOutcome;
  readonly resourceType?: string;
  readonly resourceId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly metadata?: Record<string, any>;
  readonly request?: RequestAuditMetadata;
}

export interface PlatformUserAuditEventInput {
  readonly platformActorUserId: string;
  readonly eventType: AuditEventType;
  readonly outcome: AuditOutcome;
  readonly resourceType?: string;
  readonly resourceId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly metadata?: Record<string, any>;
  readonly request?: RequestAuditMetadata;
}

export interface SystemAuditEventInput {
  readonly eventType: AuditEventType;
  readonly outcome: AuditOutcome;
  readonly resourceType?: string;
  readonly resourceId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly metadata?: Record<string, any>;
  readonly request?: RequestAuditMetadata;
}

export interface ServiceAuditEventInput {
  readonly tenantId?: string;
  readonly eventType: AuditEventType;
  readonly outcome: AuditOutcome;
  readonly resourceType?: string;
  readonly resourceId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly metadata?: Record<string, any>;
  readonly request?: RequestAuditMetadata;
}
