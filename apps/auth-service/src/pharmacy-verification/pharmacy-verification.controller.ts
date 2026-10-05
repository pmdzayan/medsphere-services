import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { PERMISSIONS } from '../authorization/permission.constants';
import { ProviderVerificationService } from './provider-verification.service';
import {
  SubmitPharmacyVerificationDto,
  PharmacyVerificationStateResponseDto,
  PharmacyProfileResponseDto,
  UpdatePharmacyProfileDto,
} from './dto/pharmacy-verification.dto';

/**
 * Candidate Task 0039 (PROVISIONAL). See
 * docs/candidates/0039-pharmacy-onboarding-verification-provisional.md
 *
 * Pharmacy-facing onboarding/verification endpoints. Every response
 * contains only the requesting provider's own state -- no cross-tenant
 * or cross-provider data is ever reachable through this controller.
 * Uses a new, narrowly-scoped tenant permission
 * (`provider.onboarding.manage`) rather than reusing an unrelated
 * existing one -- granted to the accepted `TENANT_ADMINISTRATOR`
 * system role via this candidate's own migration, following exactly
 * the same append-only catalogue-extension pattern Task 0026 used for
 * its own `inventory.availability-requests.*` permissions.
 */
@ApiTags('pharmacy-verification')
@Controller('providers/:providerId')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class PharmacyVerificationController {
  constructor(private readonly verification: ProviderVerificationService) {}

  @Get('profile')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.providerOnboardingManage)
  @ApiOperation({ summary: "Read the assigned pharmacy's safe profile fields" })
  @ApiOkResponse({ type: PharmacyProfileResponseDto })
  async getProfile(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
  ): Promise<PharmacyProfileResponseDto> {
    return this.verification.getProfile(identity, providerId);
  }

  @Patch('profile')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.providerOnboardingManage)
  @ApiOperation({ summary: "Update the assigned pharmacy's safe, editable profile fields" })
  async updateProfile(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() dto: UpdatePharmacyProfileDto,
  ): Promise<{ updated: true }> {
    // Explicit allowlist mapping -- never spread `dto` directly into
    // Prisma. Only fields the client actually sent (partial update)
    // and only from this fixed, reviewed list ever reach the update.
    // `providerType`, `isVerified`, `isActive`, `deletedAt`, `tenantId`
    // have no path into this object regardless of what the request
    // body contains -- they are simply never read from `dto`.
    const updates: Record<string, string | number> = {};
    if (dto.businessName !== undefined) updates.businessName = dto.businessName;
    if (dto.ownerName !== undefined) updates.ownerName = dto.ownerName;
    if (dto.email !== undefined) updates.email = dto.email;
    if (dto.phone !== undefined) updates.phone = dto.phone;
    if (dto.address !== undefined) updates.address = dto.address;
    if (dto.city !== undefined) updates.city = dto.city;
    if (dto.state !== undefined) updates.state = dto.state;
    if (dto.country !== undefined) updates.country = dto.country;
    if (dto.postalCode !== undefined) updates.postalCode = dto.postalCode;
    if (dto.latitude !== undefined) updates.latitude = dto.latitude;
    if (dto.longitude !== undefined) updates.longitude = dto.longitude;

    await this.verification.updateProfile(identity, providerId, updates);
    return { updated: true };
  }

  @Get('verification')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.providerOnboardingManage)
  @ApiOperation({ summary: "Read the assigned provider's current onboarding/verification state" })
  @ApiOkResponse({ type: PharmacyVerificationStateResponseDto })
  async getState(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
  ): Promise<PharmacyVerificationStateResponseDto> {
    const {
      current,
      openSubmission,
      verificationSources,
      jurisdictionReviewRequired,
      jurisdictionNote,
    } = await this.verification.getCurrentState(identity, providerId);
    const toRecord = (row: typeof current) =>
      row
        ? {
            verificationId: row.id,
            status: row.status,
            submittedAt: row.submittedAt,
            licenseExpiryDate: row.licenseExpiryDate,
            applicantMessage: row.applicantMessage,
            version: row.version,
          }
        : null;
    return {
      current: toRecord(current),
      openSubmission: toRecord(openSubmission),
      verificationSources: [...verificationSources],
      jurisdictionReviewRequired,
      jurisdictionNote,
    };
  }

  @Post('verification')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.providerOnboardingManage)
  @ApiOperation({
    summary: 'Submit (or resubmit) pharmacy verification evidence for the assigned provider',
  })
  async submit(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() dto: SubmitPharmacyVerificationDto,
  ): Promise<{ verificationId: string }> {
    return this.verification.submitVerification({
      actor: identity,
      providerId,
      licenseNumber: dto.licenseNumber,
      licenseExpiryDate: new Date(dto.licenseExpiryDate),
      businessRegistrationNumber: dto.businessRegistrationNumber,
      governmentIdReference: dto.governmentIdReference,
    });
  }
}
