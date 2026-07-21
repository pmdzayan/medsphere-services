import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { AuditRepository, CreateAuditLogData, AuditLogFilterParams } from './audit.repository';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
    private readonly rbacService: RbacService,
  ) {}

  /**
   * Public method to persist a raw audit log entry.
   * Used by the AuditLogInterceptor and other services.
   */
  async log(data: CreateAuditLogData) {
    return this.repository.create(data);
  }

  async logCreate(params: {
    tenantId: string;
    userId?: string;
    resource: string;
    resourceId?: string;
    newValue?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
  }) {
    return this.log({
      ...params,
      action: 'CREATE',
      oldValues: undefined,
    });
  }

  async logUpdate(params: {
    tenantId: string;
    userId?: string;
    resource: string;
    resourceId?: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
  }) {
    return this.log({
      ...params,
      action: 'UPDATE',
    });
  }

  async logDelete(params: {
    tenantId: string;
    userId?: string;
    resource: string;
    resourceId?: string;
    oldValue?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
  }) {
    return this.log({
      ...params,
      action: 'DELETE',
      newValues: undefined,
    });
  }

  async logCustom(params: CreateAuditLogData) {
    return this.log(params);
  }

  async findById(id: string) {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new NotFoundException('Audit log not found');
    }
    return record;
  }

  async findAll(params: AuditLogFilterParams & { requestingUserId: string }) {
    // Verify the requesting user has audit:read permission
    const userPermissions = await this.rbacService.getUserPermissions(params.requestingUserId);
    if (!userPermissions.includes('audit:read')) {
      throw new ForbiddenException('Insufficient permissions to view audit logs');
    }

    const filterParams: AuditLogFilterParams = {
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.action,
      resource: params.resource,
      startDate: params.startDate,
      endDate: params.endDate,
      limit: params.limit,
      offset: params.offset,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    };

    return this.repository.findAll(filterParams);
  }
}
