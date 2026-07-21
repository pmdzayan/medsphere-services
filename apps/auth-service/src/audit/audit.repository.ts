import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAuditLogData {
  tenantId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AuditLogFilterParams {
  tenantId?: string;
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAuditLogData) {
    const createInput: Record<string, unknown> = {
      tenant: { connect: { id: data.tenantId } },
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      correlationId: data.correlationId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    };
    if (data.userId) {
      createInput.user = { connect: { id: data.userId } };
    }
    if (data.oldValues !== undefined) {
      createInput.oldValues = data.oldValues;
    }
    if (data.newValues !== undefined) {
      createInput.newValues = data.newValues;
    }
    if (data.metadata !== undefined) {
      createInput.metadata = data.metadata;
    }
    return this.prisma.client.auditLog.create({
      data: createInput as Parameters<typeof this.prisma.client.auditLog.create>[0]['data'],
    });
  }

  async findById(id: string) {
    return this.prisma.client.auditLog.findUnique({
      where: { id },
    });
  }

  async findAll(params: AuditLogFilterParams) {
    const where: Record<string, unknown> = {};

    if (params.tenantId) where.tenantId = params.tenantId;
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.resource) where.resource = params.resource;

    if (params.startDate || params.endDate) {
      const createdAtFilter: Record<string, Date> = {};
      if (params.startDate) createdAtFilter.gte = new Date(params.startDate);
      if (params.endDate) createdAtFilter.lte = new Date(params.endDate);
      where.createdAt = createdAtFilter;
    }

    const take = params.limit ?? 50;
    const skip = params.offset ?? 0;
    const orderBy = params.sortBy
      ? { [params.sortBy]: params.sortOrder ?? 'desc' }
      : { createdAt: 'desc' as const };

    const [data, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        orderBy,
        take,
        skip,
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    return { data, total, limit: take, offset: skip };
  }
}
