import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PublicEndpoint } from '@medsphere/common';
import { Throttle } from '@nestjs/throttler';

import { DedicatedAuthEndpoint } from '../auth/dedicated-auth-endpoint.decorator';
import { extractRequestMetadata, MetadataHttpRequest } from '../auth/request-metadata';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformInvitationService } from './platform-invitation.service';
import { PlatformAuthGuard } from './guards/platform-auth.guard';
import { PlatformPermissionsGuard } from './guards/platform-permissions.guard';
import { RequirePlatformPermissions } from './decorators/require-platform-permissions.decorator';
import { CurrentPlatformIdentity } from './decorators/current-platform-identity.decorator';
import { PlatformAuthenticatedIdentity } from './platform.types';
import { PLATFORM_PERMISSIONS } from './platform.constants';
import {
  CreateInvitationResponseDto,
  CreatePlatformInvitationDto,
} from './dto/create-platform-invitation.dto';
import {
  PlatformGoogleLoginDto,
  PlatformInvitationAcceptDto,
  PlatformLoginDto,
  PlatformRefreshDto,
} from './dto/platform-login.dto';
import {
  PlatformAdminListQueryDto,
  PlatformInvitationListQueryDto,
} from './dto/platform-list-query.dto';
import {
  PlatformAdminListResponseDto,
  PlatformIdentityResponseDto,
  PlatformInvitationListResponseDto,
  PlatformLoginResponseDto,
  PlatformRevokeSessionsResponseDto,
} from './dto/platform-response.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('platform')
@ApiTags('Platform Administration')
@ApiBearerAuth()
export class PlatformController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly admins: PlatformAdminService,
    private readonly invitations: PlatformInvitationService,
  ) {}
  // -------------------------------------------------------------------------
  // Public authentication boundary (NOT tenant administration).
  // Platform login has NO tenant slug / organization selection.
  // -------------------------------------------------------------------------

  @Post('login')
  @PublicEndpoint()
  @Throttle({
    ip: { limit: 10, ttl: 60_000 },
    account: { limit: 5, ttl: 60_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Authenticate an existing platform administrator (password). No tenant slug or organization selection.',
  })
  @ApiOkResponse({ type: PlatformLoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or no active platform access' })
  login(@Body() dto: PlatformLoginDto, @Req() request: MetadataHttpRequest) {
    return this.auth.login(dto.email, dto.password, extractRequestMetadata(request));
  }

  @Post('login/google')
  @PublicEndpoint()
  @Throttle({
    ip: { limit: 10, ttl: 60_000 },
    account: { limit: 5, ttl: 60_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Authenticate an existing platform administrator via Google. No tenant slug or organization selection.',
  })
  @ApiOkResponse({ type: PlatformLoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid Google identity or no active platform access' })
  loginGoogle(@Body() dto: PlatformGoogleLoginDto, @Req() request: MetadataHttpRequest) {
    return this.auth.loginWithGoogle(dto.idToken, extractRequestMetadata(request));
  }

  @Post('invitations/accept')
  @PublicEndpoint()
  @Throttle({
    ip: { limit: 10, ttl: 60_000 },
    account: { limit: 5, ttl: 60_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Accept a one-time PLATFORM_ADMIN invitation with a verified global identity (password or Google).',
  })
  @ApiOkResponse({ type: PlatformLoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid invitation proof or identity mismatch' })
  acceptInvitation(@Body() dto: PlatformInvitationAcceptDto, @Req() request: MetadataHttpRequest) {
    return this.auth.acceptInvitation(dto, extractRequestMetadata(request));
  }

  @Post('refresh')
  @PublicEndpoint()
  @Throttle({
    ip: { limit: 30, ttl: 60_000 },
    account: { limit: 20, ttl: 60_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a platform refresh credential (dedicated platform session)' })
  @ApiOkResponse({ type: PlatformLoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh credential' })
  refresh(@Body() dto: PlatformRefreshDto, @Req() request: MetadataHttpRequest) {
    return this.auth.refresh(dto.refreshToken, extractRequestMetadata(request));
  }

  @Post('logout')
  @DedicatedAuthEndpoint()
  @UseGuards(PlatformAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out the current platform session' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async logout(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Req() request: MetadataHttpRequest,
  ) {
    await this.auth.logout(identity, extractRequestMetadata(request));
    return { message: 'Logged out successfully' };
  }
  // -------------------------------------------------------------------------
  // Authenticated platform administration -- dedicated platform tokens only.
  // The global tenant JwtAuthGuard is bypassed via @DedicatedAuthEndpoint();
  // PlatformAuthGuard rejects any tenant access token, and
  // PlatformPermissionsGuard re-reads platform permissions live.
  // -------------------------------------------------------------------------

  @Get('identity')
  @DedicatedAuthEndpoint()
  @UseGuards(PlatformAuthGuard)
  @ApiOperation({
    summary:
      'Read the authenticated platform actor\u2019s own platform identity, effective roles, and permissions.',
  })
  @ApiOkResponse({ type: PlatformIdentityResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  identity(@CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity) {
    return this.admins.readPlatformIdentity(identity);
  }

  @Get('admins')
  @DedicatedAuthEndpoint()
  @UseGuards(PlatformAuthGuard, PlatformPermissionsGuard)
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.administrationRead)
  @ApiOperation({ summary: 'Bounded deterministic listing of platform accounts/admins' })
  @ApiOkResponse({ type: PlatformAdminListResponseDto })
  @ApiForbiddenResponse({ description: 'Requires platform.administration.read' })
  listAdmins(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Query() query: PlatformAdminListQueryDto,
  ): Promise<PlatformAdminListResponseDto> {
    return this.admins.listPlatformAdmins(query.limit, query.cursor);
  }

  @Post('invitations')
  @DedicatedAuthEndpoint()
  @UseGuards(PlatformAuthGuard, PlatformPermissionsGuard)
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.administrationManage)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a one-time PLATFORM_ADMIN invitation' })
  @ApiOkResponse({ type: CreateInvitationResponseDto })
  @ApiForbiddenResponse({ description: 'Requires platform.administration.manage' })
  createInvitation(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Body() dto: CreatePlatformInvitationDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.invitations.createInvitation(
      identity.userId,
      dto.targetEmail,
      dto.roleKey,
      dto.ttlDays ?? 7,
      extractRequestMetadata(request),
    );
  }

  @Get('invitations')
  @DedicatedAuthEndpoint()
  @UseGuards(PlatformAuthGuard, PlatformPermissionsGuard)
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.administrationManage)
  @ApiOperation({ summary: 'List platform invitations (bounded)' })
  @ApiOkResponse({ type: PlatformInvitationListResponseDto })
  @ApiForbiddenResponse({ description: 'Requires platform.administration.manage' })
  listInvitations(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Query() query: PlatformInvitationListQueryDto,
  ): Promise<PlatformInvitationListResponseDto> {
    return this.invitations.listInvitations(identity.userId, query.limit, query.cursor);
  }

  @Get('invitations/:invitationId')
  @DedicatedAuthEndpoint()
  @UseGuards(PlatformAuthGuard, PlatformPermissionsGuard)
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.administrationManage)
  @ApiOperation({ summary: 'Read one platform invitation (bounded, safe fields)' })
  @ApiOkResponse({ type: PlatformInvitationListResponseDto })
  @ApiForbiddenResponse({ description: 'Requires platform.administration.manage' })
  getInvitation(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Param('invitationId', uuid) invitationId: string,
  ) {
    return this.invitations.getInvitation(identity.userId, invitationId);
  }
  @Post('invitations/:invitationId/revoke')
  @DedicatedAuthEndpoint()
  @UseGuards(PlatformAuthGuard, PlatformPermissionsGuard)
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.administrationManage)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a pending platform invitation' })
  @ApiOkResponse({ description: 'Invitation revoked' })
  @ApiForbiddenResponse({ description: 'Requires platform.administration.manage' })
  async revokeInvitation(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Param('invitationId', uuid) invitationId: string,
    @Req() request: MetadataHttpRequest,
  ) {
    await this.invitations.revokeInvitation(
      identity.userId,
      invitationId,
      extractRequestMetadata(request),
    );
    return { message: 'Invitation revoked' };
  }

  @Patch('admins/:platformAccountId/suspend')
  @DedicatedAuthEndpoint()
  @UseGuards(PlatformAuthGuard, PlatformPermissionsGuard)
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.administrationManage)
  @ApiOperation({
    summary: 'Suspend a platform administrator and immediately revoke platform sessions',
  })
  @ApiForbiddenResponse({ description: 'Requires platform.administration.manage' })
  suspendAdmin(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Param('platformAccountId', uuid) platformAccountId: string,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.admins.suspendPlatformAdmin(
      identity,
      platformAccountId,
      extractRequestMetadata(request),
    );
  }

  @Patch('admins/:platformAccountId/reactivate')
  @DedicatedAuthEndpoint()
  @UseGuards(PlatformAuthGuard, PlatformPermissionsGuard)
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.administrationManage)
  @ApiOperation({ summary: 'Reactivate a suspended platform administrator (new login required)' })
  @ApiForbiddenResponse({ description: 'Requires platform.administration.manage' })
  reactivateAdmin(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Param('platformAccountId', uuid) platformAccountId: string,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.admins.reactivatePlatformAdmin(
      identity,
      platformAccountId,
      extractRequestMetadata(request),
    );
  }

  @Post('admins/:userId/revoke-sessions')
  @DedicatedAuthEndpoint()
  @UseGuards(PlatformAuthGuard, PlatformPermissionsGuard)
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.administrationManage)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Immediately revoke all active platform sessions for one global user' })
  @ApiOkResponse({ type: PlatformRevokeSessionsResponseDto })
  @ApiForbiddenResponse({ description: 'Requires platform.administration.manage' })
  async revokeSessions(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Param('userId', uuid) userId: string,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.auth.revokeSessionsForUser(identity, userId, extractRequestMetadata(request));
  }
}
