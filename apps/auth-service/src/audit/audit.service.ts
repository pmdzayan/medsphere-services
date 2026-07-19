import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { AuditRepository, CreateAuditLogData, AuditLogFilterParams } from './audit.repository';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
    private readonly rbacService: RbacService,
  ) {}

  async logCreate(params: {
    organizationId: string;
    userId: string;
    module: string;
    resourceType: string;
    resourceId: string;
    newValue?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    deviceType?: string;
  }) {
    return this.log({
      ...params,
      action: 'CREATE',
      oldValue: undefined,
    });
  }

  async logUpdate(params: {
    organizationId: string;
    userId: string;
    module: string;
    resourceType: string;
    resourceId: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    deviceType?: string;
  }) {
    return this.log({
      ...params,
      action: 'UPDATE',
    });
  }

  async logDelete(params: {
    organizationId: string;
    userId: string;
    module: string;
    resourceType: string;
    resourceId: string;
    oldValue?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    deviceType?: string;
  }) {
    return this.log({
      ...params,
      action: 'DELETE',
      newValue: undefined,
    });
  }

  async logRestore(params: {
    organizationId: string;
    userId: string;
    module: string;
    resourceType: string;
    resourceId: string;
    newValue?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    deviceType?: string;
  }) {
    return this.log({
      ...params,
      action: 'RESTORE',
      oldValue: undefined,
    });
  }

  async logLogin(params: {
    organizationId: string;
    userId: string;
    module: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    deviceType?: string;
  }) {
    return this.log({
      ...params,
      action: 'LOGIN',
      resourceType: 'session',
      resourceId: params.userId,
      oldValue: undefined,
      newValue: undefined,
    });
  }

  async logLogout(params: {
    organizationId: string;
    userId: string;
    module: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    deviceType?: string;
  }) {
    return this.log({
      ...params,
      action: 'LOGOUT',
      resourceType: 'session',
      resourceId: params.userId,
      oldValue: undefined,
      newValue: undefined,
    });
  }

  async logCustom(params: {
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
    deviceType?: string;
  }) {
    return this.log(params);
  }

  private async log(data: CreateAuditLogData) {
    return this.repository.create(data);
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
      organizationId: params.organizationId,
      userId: params.userId,
      module: params.module,
      resourceType: params.resourceType,
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
