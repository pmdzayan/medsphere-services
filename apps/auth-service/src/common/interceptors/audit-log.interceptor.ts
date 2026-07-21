import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../audit/audit.service';

export const AUDIT_ACTION_KEY = 'audit_action';

export interface AuditActionMetadata {
  action: string;
  resource: string;
  captureBody?: boolean;
}

/**
 * Decorator that marks a route handler for automatic audit logging.
 *
 * Usage:
 * ```typescript
 * @AuditAction({ action: 'create', resource: 'inventory', captureBody: true })
 * ```
 */
export const AuditAction =
  (metadata: AuditActionMetadata): MethodDecorator =>
  (target, propertyKey, descriptor) => {
    Reflect.defineMetadata(AUDIT_ACTION_KEY, metadata, descriptor.value as object);
    return descriptor;
  };

/**
 * Interceptor that automatically creates audit log entries for decorated
 * HTTP endpoints upon successful response completion.
 *
 * Extracts request context:
 * - `x-correlation-id` header -> correlationId
 * - `x-tenant-id` header -> tenantId
 * - IP address from request
 * - User-agent from request
 * - User identity from JWT payload
 *
 * Audit dispatch is non-blocking: errors are caught and logged as CRITICAL
 * but never break the primary request lifecycle.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditMetadata = this.reflector.get<AuditActionMetadata>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    if (!auditMetadata) {
      return next.handle();
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const request = context.switchToHttp().getRequest<any>();
    const identity = request.user as { userId?: string; sub?: string } | undefined;
    const userId = identity?.userId ?? identity?.sub;
    const tenantId =
      (request.headers?.['x-tenant-id'] as string | undefined) ??
      '00000000-0000-0000-0000-000000000000';
    const correlationId = request.headers?.['x-correlation-id'] as string | undefined;
    const ipAddress = request.ip as string | undefined;
    const userAgent = request.headers?.['user-agent'] as string | undefined;
    const newValues = auditMetadata.captureBody
      ? (request.body as Record<string, unknown>)
      : undefined;

    return next.handle().pipe(
      tap({
        next: () => {
          this.dispatchAudit({
            tenantId,
            userId,
            action: auditMetadata.action,
            resource: auditMetadata.resource,
            correlationId,
            ipAddress,
            userAgent,
            newValues,
          });
        },
        error: () => {
          // Do not audit on failures - only successful completions
        },
      }),
    );
  }

  private async dispatchAudit(params: {
    tenantId: string;
    userId?: string;
    action: string;
    resource: string;
    correlationId?: string;
    ipAddress?: string;
    userAgent?: string;
    newValues?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.auditService.log({
        tenantId: params.tenantId,
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        correlationId: params.correlationId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        newValues: params.newValues,
      });
    } catch (error) {
      this.logger.error(
        `CRITICAL: Failed to persist audit log for action=${params.action} resource=${params.resource}: ${(error as Error).message}`,
      );
    }
  }
}
