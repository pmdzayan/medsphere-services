import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { PrivacyRepository } from './privacy.repository';
import { UpdatePrivacyDto } from './dto/privacy.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly privacyRepository: PrivacyRepository,
  ) {}

  async getPrivacy(userId: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const privacy = await this.privacyRepository.findByUserId(userId);
    if (!privacy) {
      return {
        sharePhone: false,
        shareEmail: false,
        allowInAppChat: true,
        privatePickup: false,
        hideSensitiveNotifications: true,
        preferredLanguage: 'en',
      };
    }
    return privacy;
  }

  async updatePrivacy(userId: string, dto: UpdatePrivacyDto) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.privacyRepository.upsert(userId, dto);
  }
}
