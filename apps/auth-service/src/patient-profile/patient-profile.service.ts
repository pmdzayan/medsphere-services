import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditWriter } from '../audit/audit-writer.service';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import type { PatientProfileResponseDto, UpdatePatientProfileDto } from './dto/patient-profile.dto';

/**
 * Candidate Task 0032 (pre-0031): self-service profile for the
 * ONE GLOBAL AUTHENTICATION IDENTITY. Every read/write here is keyed
 * exclusively by identity.userId, extracted server-side from the
 * verified access token via CurrentIdentity -- never by a
 * client-supplied ID, tenantId, or membershipId. This is what makes
 * cross-user reads/writes structurally impossible: there is no code
 * path in this service that accepts a caller-chosen target user.
 *
 * Deliberately reuses the existing User and UserPrivacy models rather
 * than introducing a parallel PatientProfile table -- every field
 * exposed here already exists on an accepted schema.
 */
@Injectable()
export class PatientProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async getOwnProfile(identity: AuthenticatedIdentity): Promise<PatientProfileResponseDto> {
    const user = await this.prisma.client.user.findFirst({
      where: { id: identity.userId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        phoneVerifiedAt: true,
        preferredLanguage: true,
        privacy: {
          select: { wantsReservationNotifications: true, hideSensitiveNotifications: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Profile not found');
    }
    return this.toResponse(user);
  }

  async updateOwnProfile(
    identity: AuthenticatedIdentity,
    dto: UpdatePatientProfileDto,
  ): Promise<PatientProfileResponseDto> {
    // Explicit whitelist -- only these exact fields are ever written,
    // regardless of what additional properties a malicious or buggy
    // client includes in the request body (class-validator's
    // whitelist/forbidNonWhitelisted ValidationPipe configuration,
    // applied globally in this service, already strips/rejects
    // unknown properties before this method ever runs; this object
    // literal is a second, explicit line of defense against mass
    // assignment).
    const userData: { firstName?: string; lastName?: string; preferredLanguage?: string } = {};
    if (dto.firstName !== undefined) userData.firstName = dto.firstName;
    if (dto.lastName !== undefined) userData.lastName = dto.lastName;
    if (dto.preferredLanguage !== undefined) userData.preferredLanguage = dto.preferredLanguage;

    const privacyData: {
      wantsReservationNotifications?: boolean;
      hideSensitiveNotifications?: boolean;
    } = {};
    if (dto.wantsReservationNotifications !== undefined) {
      privacyData.wantsReservationNotifications = dto.wantsReservationNotifications;
    }
    if (dto.hideSensitiveNotifications !== undefined) {
      privacyData.hideSensitiveNotifications = dto.hideSensitiveNotifications;
    }

    const user = await this.prisma.client.user.update({
      // Scoped by the server-verified identity.userId ONLY -- there is
      // no field in this WHERE clause a client can influence.
      where: { id: identity.userId },
      data: {
        ...userData,
        ...(Object.keys(privacyData).length > 0
          ? {
              privacy: {
                upsert: {
                  create: { ...privacyData },
                  update: { ...privacyData },
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        phoneVerifiedAt: true,
        preferredLanguage: true,
        privacy: {
          select: { wantsReservationNotifications: true, hideSensitiveNotifications: true },
        },
      },
    });

    // Candidate Task 0032 (pre-0031) known integration point: this is
    // a GLOBAL personal-identity action, not a tenant business
    // operation -- appendPlatformUser (scope PLATFORM, actorType
    // PLATFORM_USER, keyed by the global userId, no tenant
    // attribution) is used deliberately instead of appendTenantUser,
    // matching the same platform/tenant audit-scope distinction
    // established for global catalog actions elsewhere in this
    // codebase. Tasks 0019+ may change exact-user accountability
    // conventions; this call is isolated to one line for easy
    // reconciliation.
    await this.audit.appendPlatformUser(this.prisma.client, {
      eventType: 'patient.profile.updated',
      outcome: 'SUCCEEDED',
      platformActorUserId: identity.userId,
      metadata: { fieldsChanged: Object.keys({ ...userData, ...privacyData }) },
    });

    return this.toResponse(user);
  }

  private toResponse(user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    phoneVerifiedAt: Date | null;
    preferredLanguage: string;
    privacy: { wantsReservationNotifications: boolean; hideSensitiveNotifications: boolean } | null;
  }): PatientProfileResponseDto {
    return {
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      phoneVerified: user.phoneVerifiedAt !== null,
      preferredLanguage: user.preferredLanguage,
      wantsReservationNotifications: user.privacy?.wantsReservationNotifications ?? false,
      hideSensitiveNotifications: user.privacy?.hideSensitiveNotifications ?? true,
    };
  }
}
