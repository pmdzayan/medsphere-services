import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'audit_action';

export interface AuditActionMetadata {
  action: string;
  resource: string;
  captureBody?: boolean;
}

/**
 * Decorator that marks a route handler for automatic audit logging.
 *
 * This mirrors the AuditAction decorator from auth-service's
 * audit-log.interceptor, enabling audit trail compliance for
 * document management operations.
 *
 * Usage:
 * ```typescript
 * @AuditAction({ action: 'create', resource: 'document', captureBody: true })
 * ```
 */
export const AuditAction =
  (metadata: AuditActionMetadata): MethodDecorator =>
  (target, propertyKey, descriptor) => {
    SetMetadata(AUDIT_ACTION_KEY, metadata)(target, propertyKey, descriptor);
    return descriptor;
  };
