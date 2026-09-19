import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformAuthGuard } from '../platform/guards/platform-auth.guard';
import { PlatformPermissionsGuard } from '../platform/guards/platform-permissions.guard';
import { RequirePlatformPermissions } from '../platform/decorators/require-platform-permissions.decorator';
import { CurrentPlatformIdentity } from '../platform/decorators/current-platform-identity.decorator';
import { PlatformAuthenticatedIdentity } from '../platform/platform.types';
import { PLATFORM_PERMISSIONS } from '../platform/platform.constants';
import { ProviderVerificationService } from './provider-verification.service';
import {
  ApproveVerificationDto,
  BeginReviewDto,
  ListVerificationQueueDto,
  PlatformVerificationDetailResponseDto,
  RejectVerificationDto,
  SuspendVerificationDto,
} from './dto/pharmacy-verification.dto';

/**
 * Candidate Task 0039 (PROVISIONAL). See
 * docs/candidates/0039-pharmacy-onboarding-verification-provisional.md
 *
 * Platform-side pharmacy verification review. Guarded by the SAME
 * `PlatformAuthGuard` + `PlatformPermissionsGuard` boundary Task 0021
 * established -- the tenant `PermissionsGuard` is never reachable
 * here, so a tenant administrator (however powerful within their own
 * tenant) cannot use these endpoints regardless of any tenant-side
 * role they hold.
 */
@ApiTags('platform-provider-verification')
@Controller('platform/provider-verifications')
@UseGuards(PlatformAuthGuard, PlatformPermissionsGuard)
export class PlatformProviderVerificationController {
  constructor(private readonly verification: ProviderVerificationService) {}

  @Get()
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.providerVerificationsReview)
  @ApiOperation({ summary: 'Bounded, filterable pharmacy verification review queue' })
  async listQueue(@Query() query: ListVerificationQueueDto) {
    return this.verification.listReviewQueue({
      limit: query.limit,
      cursor: query.cursor,
      status: query.status,
      businessNameSearch: query.businessNameSearch,
    });
  }

  @Get(':verificationId')
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.providerVerificationsReview)
  @ApiOperation({
    summary: 'Pharmacy verification detail for platform review (includes internal notes)',
  })
  async getDetail(
    @Param('verificationId', new ParseUUIDPipe({ version: '4' })) verificationId: string,
  ): Promise<PlatformVerificationDetailResponseDto> {
    return this.verification.getReviewDetail(verificationId);
  }

  @Post('begin-review')
  @HttpCode(HttpStatus.OK)
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.providerVerificationsReview)
  @ApiOperation({ summary: 'Mark a pending pharmacy verification submission as under review' })
  async beginReview(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Body() dto: BeginReviewDto,
  ): Promise<{ status: 'ok' }> {
    await this.verification.beginReview({
      reviewerActor: {
        platformUserId: identity.userId,
        platformAccountId: identity.platformAccountId,
      },
      verificationId: dto.verificationId,
      expectedVersion: dto.expectedVersion,
    });
    return { status: 'ok' };
  }

  @Post('approve')
  @HttpCode(HttpStatus.OK)
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.providerVerificationsReview)
  @ApiOperation({ summary: 'Approve a pharmacy verification submission' })
  async approve(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Body() dto: ApproveVerificationDto,
  ): Promise<{ status: 'ok' }> {
    await this.verification.approve({
      reviewerActor: {
        platformUserId: identity.userId,
        platformAccountId: identity.platformAccountId,
      },
      verificationId: dto.verificationId,
      expectedVersion: dto.expectedVersion,
    });
    return { status: 'ok' };
  }

  @Post('reject')
  @HttpCode(HttpStatus.OK)
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.providerVerificationsReview)
  @ApiOperation({ summary: 'Reject a pharmacy verification submission' })
  async reject(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Body() dto: RejectVerificationDto,
  ): Promise<{ status: 'ok' }> {
    await this.verification.reject({
      reviewerActor: {
        platformUserId: identity.userId,
        platformAccountId: identity.platformAccountId,
      },
      verificationId: dto.verificationId,
      expectedVersion: dto.expectedVersion,
      applicantMessage: dto.applicantMessage,
      verificationNotes: dto.verificationNotes,
    });
    return { status: 'ok' };
  }

  @Post('suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.providerVerificationsReview)
  @ApiOperation({ summary: 'Suspend a currently approved pharmacy verification' })
  async suspend(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Body() dto: SuspendVerificationDto,
  ): Promise<{ status: 'ok' }> {
    await this.verification.suspend({
      reviewerActor: {
        platformUserId: identity.userId,
        platformAccountId: identity.platformAccountId,
      },
      verificationId: dto.verificationId,
      expectedVersion: dto.expectedVersion,
      verificationNotes: dto.verificationNotes,
    });
    return { status: 'ok' };
  }
}
