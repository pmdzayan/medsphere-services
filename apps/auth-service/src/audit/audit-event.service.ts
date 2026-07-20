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
    requestMetadata?: { ipAddress?: string; userAgent?: string; requestId?: string },
  ): Promise<void> {
    await this.auditService.logCustom({
      organizationId: context.tenantId ?? 'system',
      userId: context.userId ?? 'unknown',
      module: 'authentication',
      action: event,
      resourceType: 'session',
      resourceId: context.sessionId ?? context.userId ?? 'unknown',
      oldValue: context.outcome === 'denied' ? { reason: context.reason } : undefined,
      newValue: context.outcome === 'success' ? { outcome: 'success' } : undefined,
      ipAddress: requestMetadata?.ipAddress,
      userAgent: requestMetadata?.userAgent,
      requestId: requestMetadata?.requestId,
    });
  }

  /**
   * Persist a business mutation as a durable audit log entry.
   */
  async recordBusinessEvent(params: {
    organizationId: string;
    userId: string;
    module: string;
    action: string;
    resourceType: string;
    resourceId: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  }): Promise<void> {
    await this.auditService.logCustom(params);
  }
}
