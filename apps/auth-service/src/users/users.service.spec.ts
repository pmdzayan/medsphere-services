import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { LocalizationService } from '../localization/localization.service';
import { PrivacyRepository } from './privacy.repository';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService privacy boundary', () => {
  const userId = randomUUID();
  const identity = {
    userId,
    tenantId: 'tenant-1',
    membershipId: 'membership-1',
    sessionId: 'session-1',
    tokenId: 'token-1',
  };
  let usersRepository: jest.Mocked<UsersRepository>;
  let privacyRepository: jest.Mocked<PrivacyRepository>;
  let audit: jest.Mocked<AuditWriter>;
  let service: UsersService;

  beforeEach(() => {
    usersRepository = {
      findById: jest.fn().mockResolvedValue({ id: userId }),
    } as unknown as jest.Mocked<UsersRepository>;
    privacyRepository = {
      findByUserId: jest.fn(),
      upsert: jest.fn(),
    } as unknown as jest.Mocked<PrivacyRepository>;
    audit = {
      appendTenantUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditWriter>;
    service = new UsersService(
      usersRepository,
      privacyRepository,
      { translate: jest.fn() } as unknown as LocalizationService,
      audit,
      { client: {} } as unknown as PrismaService,
    );
  });

  it('returns only accepted preference fields from a persistence record', async () => {
    privacyRepository.findByUserId.mockResolvedValue({
      id: randomUUID(),
      userId,
      sharePhone: true,
      shareEmail: false,
      allowInAppChat: true,
      privatePickup: false,
      hideSensitiveNotifications: true,
      wantsReservationNotifications: false,
      wantsOperationalAlerts: false,
      preferredLanguage: 'en',
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await service.getPrivacy(userId);
    expect(response).toEqual({
      sharePhone: true,
      shareEmail: false,
      allowInAppChat: true,
      privatePickup: false,
      hideSensitiveNotifications: true,
      wantsReservationNotifications: false,
      wantsOperationalAlerts: false,
    });
    expect(response).not.toHaveProperty('id');
    expect(response).not.toHaveProperty('userId');
    expect(response).not.toHaveProperty('version');
    expect(response).not.toHaveProperty('preferredLanguage');
  });

  it('returns safe defaults when no privacy record exists yet', async () => {
    privacyRepository.findByUserId.mockResolvedValue(null);

    const response = await service.getPrivacy(userId);
    expect(response).toEqual({
      sharePhone: false,
      shareEmail: false,
      allowInAppChat: true,
      privatePickup: false,
      hideSensitiveNotifications: true,
      wantsReservationNotifications: false,
      wantsOperationalAlerts: false,
    });
  });

  it('rejects an empty privacy patch', async () => {
    await expect(service.updatePrivacy(identity as never, {})).rejects.toThrow(BadRequestException);
    expect(privacyRepository.upsert).not.toHaveBeenCalled();
    expect(audit.appendTenantUser).not.toHaveBeenCalled();
  });

  it('audits a privacy-preference change with only the bounded changed keys', async () => {
    privacyRepository.upsert.mockResolvedValue({
      id: randomUUID(),
      userId,
      sharePhone: false,
      shareEmail: false,
      allowInAppChat: true,
      privatePickup: false,
      hideSensitiveNotifications: true,
      wantsReservationNotifications: true,
      wantsOperationalAlerts: false,
      preferredLanguage: 'en',
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await service.updatePrivacy(identity as never, {
      wantsReservationNotifications: true,
    });

    expect(response.wantsReservationNotifications).toBe(true);
    expect(audit.appendTenantUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'privacy.preference.changed',
        outcome: 'SUCCEEDED',
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        metadata: { preferenceKeys: 'wantsReservationNotifications' },
      }),
    );
  });
});
