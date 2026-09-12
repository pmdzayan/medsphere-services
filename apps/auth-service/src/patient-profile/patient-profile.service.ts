import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withSerializableRetry } from '@medsphere/database';
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
    //
    // Correction pass 1: firstName/lastName are trimmed server-side --
    // the backend security/correctness boundary must not depend on the
    // frontend having already trimmed the value. A whitespace-only
    // string normalizes to '', which is then rejected below exactly
    // like an empty string, rather than being silently persisted.
    const userData: { firstName?: string; lastName?: string; preferredLanguage?: string } = {};
    if (dto.firstName !== undefined) {
      const trimmed = dto.firstName.trim();
      if (trimmed.length === 0) {
        throw new BadRequestException('firstName cannot be empty or whitespace-only');
      }
      userData.firstName = trimmed;
    }
    if (dto.lastName !== undefined) {
      const trimmed = dto.lastName.trim();
      if (trimmed.length === 0) {
        throw new BadRequestException('lastName cannot be empty or whitespace-only');
      }
      userData.lastName = trimmed;
    }
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

    // Correction pass 1: PATCH {} (zero mutable fields, after the
    // whitelist above) must never reach the database or produce an
    // audit event -- there is nothing accountable to record.
    const changedFieldNames = Object.keys({ ...userData, ...privacyData });
    if (changedFieldNames.length === 0) {
      throw new BadRequestException('At least one mutable profile field must be provided');
    }

    // Correction pass 1: the audit contract's validateAuditMetadata
    // rejects array-valued metadata (values must be bounded scalars:
    // string/number/boolean/null). fieldsChanged is therefore a
    // deterministic, sorted, comma-joined string -- never an array --
    // and this exact value is what a real appendPlatformUser call
    // validates (see patient-profile.service.spec.ts for a regression
    // exercising the real validator, not a mock).
    const fieldsChanged = changedFieldNames.sort().join(',');

    // Correction pass 1: the profile mutation and its accountability
    // record must be atomic -- an audit failure must never leave a
    // committed mutation with no corresponding evidence. Both
    // statements run inside the same PostgreSQL transaction, using
    // this repository's existing withSerializableRetry convention; if
    // appendPlatformUser throws (e.g. a metadata validation failure or
    // a database error), the whole transaction rolls back and the
    // user's row reverts to its pre-update values.
    const user = await withSerializableRetry(this.prisma.client, async (transaction) => {
      const updated = await transaction.user.update({
        // Scoped by the server-verified identity.userId ONLY -- there
        // is no field in this WHERE clause a client can influence.
        // A deletedAt/status filter is deliberately NOT duplicated
        // here: Prisma's generated UserWhereUniqueInput for .update()
        // only accepts genuinely unique fields, and adding an
        // arbitrary additional condition would require switching to
        // updateMany() (a larger, riskier change to verify without a
        // working generated Prisma client in this sandbox -- see the
        // final report). This is not a real gap in practice:
        // SessionRepository.validateAccessIdentity (run on every
        // request via the global JwtAuthGuard) already rejects a
        // session whose underlying User has deletedAt set or status
        // != 'ACTIVE' before a request ever reaches this service --
        // confirmed by direct inspection of that query's WHERE clause,
        // which nests membership.user.status/deletedAt. getOwnProfile
        // keeps its own deletedAt filter as an independent, low-cost
        // defensive read-path check; this write path relies on the
        // session guard, which is the actual, provably-effective
        // control.
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

      // Candidate Task 0032 (pre-0031) known integration point: this
      // is a GLOBAL personal-identity action, not a tenant business
      // operation -- appendPlatformUser (scope PLATFORM, actorType
      // PLATFORM_USER, keyed by the global userId, no tenant
      // attribution) is used deliberately instead of appendTenantUser,
      // matching the same platform/tenant audit-scope distinction
      // established for global catalog actions elsewhere in this
      // codebase. Tasks 0019+ may change exact-user accountability
      // conventions; this call is isolated to one block for easy
      // reconciliation.
      await this.audit.appendPlatformUser(transaction, {
        eventType: 'patient.profile.updated',
        outcome: 'SUCCEEDED',
        platformActorUserId: identity.userId,
        metadata: { fieldsChanged },
      });

      return updated;
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
