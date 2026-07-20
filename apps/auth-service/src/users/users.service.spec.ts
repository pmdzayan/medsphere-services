import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { LocalizationService } from '../localization/localization.service';
import { PrivacyRepository } from './privacy.repository';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService privacy boundary', () => {
  const userId = randomUUID();
  let usersRepository: jest.Mocked<UsersRepository>;
  let privacyRepository: jest.Mocked<PrivacyRepository>;
  let service: UsersService;

  beforeEach(() => {
    usersRepository = {
      findById: jest.fn().mockResolvedValue({ id: userId }),
    } as unknown as jest.Mocked<UsersRepository>;
    privacyRepository = {
      findByUserId: jest.fn(),
      upsert: jest.fn(),
    } as unknown as jest.Mocked<PrivacyRepository>;
    service = new UsersService(usersRepository, privacyRepository, {
      translate: jest.fn(),
    } as unknown as LocalizationService);
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
    });
    expect(response).not.toHaveProperty('id');
    expect(response).not.toHaveProperty('userId');
    expect(response).not.toHaveProperty('version');
    expect(response).not.toHaveProperty('preferredLanguage');
  });

  it('rejects an empty privacy patch', async () => {
    await expect(service.updatePrivacy(userId, {})).rejects.toThrow(BadRequestException);
    expect(privacyRepository.upsert).not.toHaveBeenCalled();
  });
});
