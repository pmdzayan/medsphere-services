import { Injectable } from '@nestjs/common';
import { AuditService } from './audit.service';
import type { AuthenticationSecurityEventContext } from '../auth/auth-security-event.service';

/**
 * Durable audit event bridge.
 *
 * Connects the S0.3 authentication security-event seam (which currently only
 * logs) to the persistent AuditLog table so that business mutations and
 * security events produce queryable, durable audit records suitable for
 * healthcare environments.
 *
 * Sensitive values such as passwords, secrets, refresh tokens, and PHI are
 * explicitly excluded from the audit payload.
 */
@Injectable()
export class AuditEventService {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Persist an authentication security event as a durable audit log entry.
   */
  async recordAuthenticationEvent(
    event: string,
    context: AuthenticationSecurityEventContext,
    requestMetadata?: { ipAddress?: string; userAgent?: string; correlationId?: string },
  ): Promise<void> {
    await this.auditService.logCustom({
      tenantId: context.tenantId ?? 'system',
      userId: context.userId ?? 'unknown',
      action: event,
      resource: 'session',
      resourceId: context.sessionId ?? context.userId ?? 'unknown',
      oldValues: context.outcome === 'denied' ? { reason: context.reason } : undefined,
      newValues: context.outcome === 'success' ? { outcome: 'success' } : undefined,
      ipAddress: requestMetadata?.ipAddress,
      userAgent: requestMetadata?.userAgent,
      correlationId: requestMetadata?.correlationId,
    });
  }

  /**
   * Persist a business mutation as a durable audit log entry.
   */
  async recordBusinessEvent(params: {
    tenantId: string;
    userId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
  }): Promise<void> {
    await this.auditService.logCustom(params);
  }
}
