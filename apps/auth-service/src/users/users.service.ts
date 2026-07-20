import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { PrivacyRepository } from './privacy.repository';
import { PrivacyResponseDto, UpdatePrivacyDto } from './dto/privacy.dto';
import { UpdateLanguageDto } from '../localization/dto/update-language.dto';
import { LocalizationService } from '../localization/localization.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly privacyRepository: PrivacyRepository,
    private readonly localizationService: LocalizationService,
  ) {}

  async getPrivacy(userId: string): Promise<PrivacyResponseDto> {
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
      };
    }
    return this.toPrivacyResponse(privacy);
  }

  async updatePrivacy(userId: string, dto: UpdatePrivacyDto) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('At least one privacy preference is required');
    }
    const privacy = await this.privacyRepository.upsert(userId, dto);
    return this.toPrivacyResponse(privacy);
  }

  async updateLanguage(userId: string, dto: UpdateLanguageDto) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.usersRepository.update(userId, {
      preferredLanguage: dto.preferredLanguage,
    });

    return {
      message: this.localizationService.translate(
        'user.profile.languageUpdated',
        dto.preferredLanguage,
        { language: dto.preferredLanguage },
      ),
    };
  }

  private toPrivacyResponse(privacy: PrivacyResponseDto): PrivacyResponseDto {
    return {
      sharePhone: privacy.sharePhone,
      shareEmail: privacy.shareEmail,
      allowInAppChat: privacy.allowInAppChat,
      privatePickup: privacy.privatePickup,
      hideSensitiveNotifications: privacy.hideSensitiveNotifications,
    };
  }
}
