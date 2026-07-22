import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { NotificationRepository } from './notification.repository';
import { NotificationSenderService } from './notification-sender.service';
import { NotificationChannel, NotificationProviderType } from './enums';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('NotificationService', () => {
  let service: NotificationService;
  let repository: jest.Mocked<NotificationRepository>;
  let sender: jest.Mocked<NotificationSenderService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: NotificationRepository,
          useValue: {
            findTemplateByTenantCodeChannel: jest.fn(),
            createTemplate: jest.fn(),
            findTemplateById: jest.fn(),
            findTemplatesByTenant: jest.fn(),
            findTemplatesByTenantAndCode: jest.fn(),
            updateTemplate: jest.fn(),
            deleteTemplate: jest.fn(),
            createConfig: jest.fn(),
            findConfigById: jest.fn(),
            findConfigsByTenant: jest.fn(),
            updateConfig: jest.fn(),
            deleteConfig: jest.fn(),
            createLog: jest.fn(),
            findLogsByTenant: jest.fn(),
            updateLogStatus: jest.fn(),
          },
        },
        {
          provide: NotificationSenderService,
          useValue: {
            sendDirect: jest.fn(),
            sendFromTemplate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    repository = module.get(NotificationRepository);
    sender = module.get(NotificationSenderService);
  });

  describe('createTemplate', () => {
    it('should create a template when no duplicate exists', async () => {
      repository.findTemplateByTenantCodeChannel.mockResolvedValue(null);
      repository.createTemplate.mockResolvedValue({ id: '1', code: 'TEST' } as never);

      const result = await service.createTemplate({
        tenantId: 'tenant-1',
        code: 'TEST',
        channel: NotificationChannel.EMAIL,
        body: 'Hello {{name}}',
        variables: ['name'],
      });

      expect(result).toEqual({ id: '1', code: 'TEST' });
      expect(repository.createTemplate).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        code: 'TEST',
        channel: NotificationChannel.EMAIL,
        subject: undefined,
        body: 'Hello {{name}}',
        variables: ['name'],
        isActive: undefined,
      });
    });

    it('should throw ConflictException when template already exists', async () => {
      repository.findTemplateByTenantCodeChannel.mockResolvedValue({
        id: 'existing',
        code: 'TEST',
      } as never);

      await expect(
        service.createTemplate({
          tenantId: 'tenant-1',
          code: 'TEST',
          channel: NotificationChannel.EMAIL,
          body: 'Hello',
          variables: ['name'],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findTemplateById', () => {
    it('should return the template when found', async () => {
      repository.findTemplateById.mockResolvedValue({ id: '1', code: 'TEST' } as never);
      const result = await service.findTemplateById('1');
      expect(result).toEqual({ id: '1', code: 'TEST' });
    });

    it('should throw NotFoundException when template not found', async () => {
      repository.findTemplateById.mockResolvedValue(null);
      await expect(service.findTemplateById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteTemplate', () => {
    it('should delete the template when found', async () => {
      repository.findTemplateById.mockResolvedValue({ id: '1' } as never);
      repository.deleteTemplate.mockResolvedValue({} as never);
      await service.deleteTemplate('1');
      expect(repository.deleteTemplate).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException when template not found', async () => {
      repository.findTemplateById.mockResolvedValue(null);
      await expect(service.deleteTemplate('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendNotification', () => {
    it('should delegate to sender.sendDirect', async () => {
      sender.sendDirect.mockResolvedValue({
        success: true,
        messageId: 'msg-1',
        provider: NotificationProviderType.MOCK,
      });

      const result = await service.sendNotification({
        tenantId: 'tenant-1',
        channel: NotificationChannel.EMAIL,
        recipient: 'test@example.com',
        body: 'Hello',
      });

      expect(result.success).toBe(true);
      expect(sender.sendDirect).toHaveBeenCalled();
    });
  });

  describe('findLogsByTenant', () => {
    it('should delegate to repository.findLogsByTenant', async () => {
      repository.findLogsByTenant.mockResolvedValue({ data: [], total: 0, limit: 50, offset: 0 });
      const result = await service.findLogsByTenant('tenant-1');
      expect(result.total).toBe(0);
      expect(repository.findLogsByTenant).toHaveBeenCalledWith('tenant-1', undefined, undefined);
    });
  });
});
