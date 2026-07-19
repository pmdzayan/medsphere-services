import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAuditLogData {
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
}

export interface AuditLogFilterParams {
  organizationId?: string;
  userId?: string;
  module?: string;
  resourceType?: string;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createData: any = {
      organizationId: data.organizationId,
      userId: data.userId,
      module: data.module,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      requestId: data.requestId,
      deviceType: data.deviceType,
    };
    if (data.oldValue !== undefined) createData.oldValue = data.oldValue;
    if (data.newValue !== undefined) createData.newValue = data.newValue;
    return this.prisma.client.auditLog.create({ data: createData });
  }

  async findById(id: string) {
    return this.prisma.client.auditLog.findUnique({
      where: { id },
    });
  }

  async findAll(params: AuditLogFilterParams) {
    const where: Record<string, unknown> = {};

    if (params.organizationId) where.organizationId = params.organizationId;
    if (params.userId) where.userId = params.userId;
    if (params.module) where.module = params.module;
    if (params.resourceType) where.resourceType = params.resourceType;

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
