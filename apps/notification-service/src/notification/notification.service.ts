import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { NotificationRepository } from './notification.repository';
import { NotificationSenderService } from './notification-sender.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NotificationChannel } from './enums';

@Injectable()
export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly sender: NotificationSenderService,
  ) {}

  // === Templates ===

  async createTemplate(dto: CreateTemplateDto) {
    const existing = await this.repository.findTemplateByTenantCodeChannel(
      dto.tenantId,
      dto.code,
      dto.channel,
    );
    if (existing) {
      throw new ConflictException(
        `Template with code "${dto.code}" already exists for channel ${dto.channel} in this tenant`,
      );
    }

    return this.repository.createTemplate({
      tenantId: dto.tenantId,
      code: dto.code,
      channel: dto.channel,
      subject: dto.subject,
      body: dto.body,
      variables: dto.variables,
      isActive: dto.isActive,
    });
  }

  async findTemplateById(id: string) {
    const template = await this.repository.findTemplateById(id);
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  async findTemplatesByTenant(tenantId: string, skip?: number, take?: number) {
    return this.repository.findTemplatesByTenant(tenantId, skip, take);
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto) {
    const existing = await this.repository.findTemplateById(id);
    if (!existing) {
      throw new NotFoundException('Template not found');
    }

    return this.repository.updateTemplate(id, dto);
  }

  async deleteTemplate(id: string): Promise<void> {
    const existing = await this.repository.findTemplateById(id);
    if (!existing) {
      throw new NotFoundException('Template not found');
    }
    await this.repository.deleteTemplate(id);
  }

  // === Configs ===

  async createConfig(dto: CreateConfigDto) {
    return this.repository.createConfig({
      tenantId: dto.tenantId,
      channel: dto.channel,
      provider: dto.provider,
      credentials: dto.credentials,
      isDefault: dto.isDefault,
      isActive: dto.isActive,
    });
  }

  async findConfigsByTenant(tenantId: string) {
    return this.repository.findConfigsByTenant(tenantId);
  }

  async updateConfig(id: string, dto: UpdateConfigDto) {
    const existing = await this.repository.findConfigById(id);
    if (!existing) {
      throw new NotFoundException('Config not found');
    }
    return this.repository.updateConfig(id, dto);
  }

  async deleteConfig(id: string): Promise<void> {
    const existing = await this.repository.findConfigById(id);
    if (!existing) {
      throw new NotFoundException('Config not found');
    }
    await this.repository.deleteConfig(id);
  }

  // === Send ===

  async sendNotification(dto: SendNotificationDto) {
    return this.sender.sendDirect({
      tenantId: dto.tenantId,
      userId: dto.userId,
      channel: dto.channel,
      recipient: dto.recipient,
      subject: dto.subject,
      body: dto.body,
      correlationId: dto.correlationId,
      metadata: dto.metadata,
    });
  }

  async sendFromTemplate(params: {
    tenantId: string;
    userId?: string;
    channel: NotificationChannel;
    recipient: string;
    templateCode: string;
    payload: Record<string, unknown>;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.sender.sendFromTemplate(params);
  }

  // === Logs ===

  async findLogsByTenant(tenantId: string, skip?: number, take?: number) {
    return this.repository.findLogsByTenant(tenantId, skip, take);
  }
}
