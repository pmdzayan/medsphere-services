import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { PrivacyRepository } from './privacy.repository';
import { PrivacyResponseDto, UpdatePrivacyDto } from './dto/privacy.dto';
import { UpdateLanguageDto } from '../localization/dto/update-language.dto';
import { LocalizationService } from '../localization/localization.service';
import { AuditWriter } from '../audit/audit-writer.service';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly privacyRepository: PrivacyRepository,
    private readonly localizationService: LocalizationService,
    private readonly audit: AuditWriter,
    private readonly prisma: PrismaService,
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
        wantsReservationNotifications: false,
        wantsOperationalAlerts: false,
      };
    }
    return this.toPrivacyResponse(privacy);
  }

  async updatePrivacy(identity: AuthenticatedIdentity, dto: UpdatePrivacyDto) {
    const user = await this.usersRepository.findById(identity.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('At least one privacy preference is required');
    }
    const privacy = await this.privacyRepository.upsert(identity.userId, dto);

    // Task 0013: audit privacy-preference changes with only the bounded
    // changed preference-keys -- never the values, never coordinates,
    // never notification content. The keys are joined into a bounded,
    // comma-separated scalar because audit metadata values must be
    // scalars (the database package enforces this).
    const preferenceKeys = Object.keys(dto).sort().join(',');
    await this.audit.appendTenantUser(this.prisma.client, {
      eventType: 'privacy.preference.changed',
      outcome: 'SUCCEEDED',
      tenantId: identity.tenantId,
      actorMembershipId: identity.membershipId,
      actorUserId: identity.userId,
      metadata: { preferenceKeys },
    });

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
      wantsReservationNotifications: privacy.wantsReservationNotifications,
      wantsOperationalAlerts: privacy.wantsOperationalAlerts,
    };
  }
}
