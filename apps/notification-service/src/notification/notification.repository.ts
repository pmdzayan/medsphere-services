import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationChannel, NotificationProviderType, NotificationStatus } from './enums';

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  // === NotificationTemplate ===

  async createTemplate(data: {
    tenantId: string;
    code: string;
    channel: NotificationChannel;
    subject?: string | null;
    body: string;
    variables: string[];
    isActive?: boolean;
  }) {
    return this.prisma.client.notificationTemplate.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        code: data.code,
        channel: data.channel,
        subject: data.subject,
        body: data.body,
        variables: data.variables as never,
        isActive: data.isActive ?? true,
      },
    });
  }

  async findTemplateById(id: string) {
    return this.prisma.client.notificationTemplate.findUnique({
      where: { id },
    });
  }

  async findTemplateByTenantCodeChannel(
    tenantId: string,
    code: string,
    channel: NotificationChannel,
  ) {
    return this.prisma.client.notificationTemplate.findUnique({
      where: {
        tenantId_code_channel: {
          tenantId,
          code,
          channel,
        },
      },
    });
  }

  async findTemplatesByTenant(tenantId: string, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.notificationTemplate.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.notificationTemplate.count({ where: { tenantId } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async findTemplatesByTenantAndCode(tenantId: string, code: string) {
    return this.prisma.client.notificationTemplate.findMany({
      where: { tenantId, code, isActive: true },
    });
  }

  async updateTemplate(
    id: string,
    data: {
      code?: string;
      channel?: NotificationChannel;
      subject?: string | null;
      body?: string;
      variables?: string[];
      isActive?: boolean;
    },
  ) {
    const updateData: Record<string, unknown> = {};
    if (data.code !== undefined) updateData.code = data.code;
    if (data.channel !== undefined) updateData.channel = data.channel;
    if (data.subject !== undefined) updateData.subject = data.subject;
    if (data.body !== undefined) updateData.body = data.body;
    if (data.variables !== undefined) updateData.variables = data.variables;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.prisma.client.notificationTemplate.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteTemplate(id: string) {
    return this.prisma.client.notificationTemplate.delete({
      where: { id },
    });
  }

  // === TenantNotificationConfig ===

  async createConfig(data: {
    tenantId: string;
    channel: NotificationChannel;
    provider: NotificationProviderType;
    credentials: Record<string, unknown>;
    isDefault?: boolean;
    isActive?: boolean;
  }) {
    return this.prisma.client.tenantNotificationConfig.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        channel: data.channel,
        provider: data.provider,
        credentials: data.credentials as never,
        isDefault: data.isDefault ?? true,
        isActive: data.isActive ?? true,
      },
    });
  }

  async findConfigById(id: string) {
    return this.prisma.client.tenantNotificationConfig.findUnique({
      where: { id },
    });
  }

  async findConfigsByTenant(tenantId: string) {
    return this.prisma.client.tenantNotificationConfig.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findDefaultConfig(tenantId: string, channel: NotificationChannel) {
    return this.prisma.client.tenantNotificationConfig.findFirst({
      where: {
        tenantId,
        channel,
        isDefault: true,
        isActive: true,
      },
    });
  }

  async updateConfig(
    id: string,
    data: {
      channel?: NotificationChannel;
      provider?: NotificationProviderType;
      credentials?: Record<string, unknown>;
      isDefault?: boolean;
      isActive?: boolean;
    },
  ) {
    const updateData: Record<string, unknown> = {};
    if (data.channel !== undefined) updateData.channel = data.channel;
    if (data.provider !== undefined) updateData.provider = data.provider;
    if (data.credentials !== undefined) updateData.credentials = data.credentials;
    if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.prisma.client.tenantNotificationConfig.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteConfig(id: string) {
    return this.prisma.client.tenantNotificationConfig.delete({
      where: { id },
    });
  }

  // === NotificationLog ===

  async createLog(data: {
    tenantId: string;
    userId?: string;
    channel: NotificationChannel;
    recipient: string;
    subject?: string | null;
    body: string;
    status?: NotificationStatus;
    errorMessage?: string | null;
    correlationId?: string | null;
    metadata?: Record<string, unknown> | null;
    sentAt?: Date | null;
  }) {
    const createData: Record<string, unknown> = {
      tenant: { connect: { id: data.tenantId } },
      channel: data.channel,
      recipient: data.recipient,
      body: data.body,
      status: data.status ?? NotificationStatus.PENDING,
    };
    if (data.userId) {
      createData.user = { connect: { id: data.userId } };
    }
    if (data.subject !== undefined) createData.subject = data.subject;
    if (data.errorMessage !== undefined) createData.errorMessage = data.errorMessage;
    if (data.correlationId !== undefined) createData.correlationId = data.correlationId;
    if (data.metadata !== undefined) createData.metadata = data.metadata;
    if (data.sentAt !== undefined) createData.sentAt = data.sentAt;

    return this.prisma.client.notificationLog.create({
      data: createData as never,
    });
  }

  async findLogsByTenant(tenantId: string, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.notificationLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.notificationLog.count({ where: { tenantId } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async updateLogStatus(
    id: string,
    status: NotificationStatus,
    errorMessage?: string | null,
    sentAt?: Date | null,
  ) {
    const updateData: Record<string, unknown> = { status };
    if (errorMessage !== undefined) updateData.errorMessage = errorMessage;
    if (sentAt !== undefined) updateData.sentAt = sentAt;

    return this.prisma.client.notificationLog.update({
      where: { id },
      data: updateData,
    });
  }
}
