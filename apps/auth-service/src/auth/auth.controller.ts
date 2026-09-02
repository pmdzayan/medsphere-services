import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { PublicEndpoint } from '@medsphere/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { IdentifyLoginDto } from './dto/identify-login.dto';
import { SelectOrganizationLoginDto } from './dto/select-organization-login.dto';
import { OrganizationSelectionRequiredDto } from './dto/organization-selection-required.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleRegisterDto } from './dto/google-register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LockSessionDto } from './dto/lock-session.dto';
import { UnlockSessionDto } from './dto/unlock-session.dto';
import { ReauthenticateSessionDto } from './dto/reauthenticate-session.dto';
import { LockedSessionGuard } from './locked-session.guard';
import { SessionStateGuard } from './session-state.guard';
import { DedicatedAuthEndpoint } from './dedicated-auth-endpoint.decorator';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { AuthenticatedIdentity } from './auth.types';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegistrationResponseDto } from './dto/registration-response.dto';
import {
  LogoutAllResponseDto,
  LogoutResponseDto,
  TokenResponseDto,
} from './dto/token-response.dto';
import { extractRequestMetadata, MetadataHttpRequest } from './request-metadata';

@Controller('auth')
@ApiTags('Authentication')
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @PublicEndpoint()
  @Throttle({
    ip: { limit: 5, ttl: 15 * 60_000 },
    account: { limit: 3, ttl: 15 * 60_000 },
  })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request policy-controlled tenant onboarding' })
  @ApiAcceptedResponse({ type: RegistrationResponseDto })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('google/register')
  @PublicEndpoint()
  @Throttle({
    ip: { limit: 5, ttl: 15 * 60_000 },
    account: { limit: 3, ttl: 15 * 60_000 },
  })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request Google-backed tenant onboarding' })
  @ApiAcceptedResponse({ type: RegistrationResponseDto })
  googleRegister(@Body() googleRegisterDto: GoogleRegisterDto) {
    return this.authService.googleRegister(googleRegisterDto);
  }

  @Post('login')
  @PublicEndpoint()
  @Throttle({
    ip: { limit: 10, ttl: 60_000 },
    account: { limit: 5, ttl: 60_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a membership-bound authenticated session' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() loginDto: LoginDto, @Req() request: MetadataHttpRequest) {
    return this.authService.login(loginDto, extractRequestMetadata(request));
  }

  @Post('login/identify')
  @PublicEndpoint()
  @Throttle({
    ip: { limit: 10, ttl: 60_000 },
    account: { limit: 5, ttl: 60_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Slug-free login step 1: verify identity, then resolve the caller\u2019s own organization membership(s)',
  })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(LoginResponseDto) },
        { $ref: getSchemaPath(OrganizationSelectionRequiredDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiExtraModels(LoginResponseDto, OrganizationSelectionRequiredDto)
  identifyLogin(@Body() identifyLoginDto: IdentifyLoginDto, @Req() request: MetadataHttpRequest) {
    return this.authService.identifyLogin(identifyLoginDto, extractRequestMetadata(request));
  }

  @Post('login/select-organization')
  @PublicEndpoint()
  @Throttle({
    ip: { limit: 10, ttl: 60_000 },
    account: { limit: 5, ttl: 60_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Slug-free login step 2: complete login for a specific, previously-identified membership',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  selectOrganizationLogin(
    @Body() dto: SelectOrganizationLoginDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authService.selectOrganizationLogin(dto, extractRequestMetadata(request));
  }

  @Post('google')
  @PublicEndpoint()
  @Throttle({
    ip: { limit: 10, ttl: 60_000 },
    account: { limit: 10, ttl: 60_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a membership-bound session with Google' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid Google identity' })
  google(@Body() googleLoginDto: GoogleLoginDto, @Req() request: MetadataHttpRequest) {
    return this.authService.googleLogin(
      googleLoginDto.tenantSlug,
      googleLoginDto.idToken,
      extractRequestMetadata(request),
    );
  }

  @Post('refresh')
  @PublicEndpoint()
  @Throttle({
    ip: { limit: 30, ttl: 60_000 },
    account: { limit: 10, ttl: 60_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a single-use refresh credential' })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh credential' })
  refresh(@Body() refreshTokenDto: RefreshTokenDto, @Req() request: MetadataHttpRequest) {
    return this.authService.refresh(refreshTokenDto, extractRequestMetadata(request));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current authenticated session family' })
  @ApiOkResponse({ type: LogoutResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  logout(@CurrentIdentity() identity: AuthenticatedIdentity, @Req() request: MetadataHttpRequest) {
    return this.authService.logout(identity, extractRequestMetadata(request));
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all sessions for the authenticated global user' })
  @ApiOkResponse({ type: LogoutAllResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  logoutAllDevices(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authService.logoutAllDevices(identity, extractRequestMetadata(request));
  }

  @Post('lock')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lock the current workstation session (Task 0014)' })
  @ApiOkResponse({ description: 'Workstation locked' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  lock(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() lockSessionDto: LockSessionDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authService.lock(identity, lockSessionDto, extractRequestMetadata(request));
  }

  @Post('unlock')
  @HttpCode(HttpStatus.OK)
  @DedicatedAuthEndpoint()
  @UseGuards(LockedSessionGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Unlock the current workstation session with a same-identity credential proof (Task 0014)',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid unlock credential' })
  unlock(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() unlockSessionDto: UnlockSessionDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authService.unlock(identity, unlockSessionDto, extractRequestMetadata(request));
  }

  @Post('reauthenticate')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Re-authenticate the current active session for step-up security (Task 0014)',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        reauthenticated: { type: 'boolean', enum: [true] },
        recentAuthenticatedAt: { type: 'string', format: 'date-time' },
      },
      required: ['reauthenticated', 'recentAuthenticatedAt'],
    },
  })
  @ApiUnauthorizedResponse({ description: 'Authentication or credential proof failed' })
  reauthenticate(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() dto: ReauthenticateSessionDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authService.reauthenticate(identity, dto, extractRequestMetadata(request));
  }

  @Post('logout-locked')
  @HttpCode(HttpStatus.OK)
  @DedicatedAuthEndpoint()
  @UseGuards(LockedSessionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out while the workstation is locked (Task 0014)' })
  @ApiOkResponse({ type: LogoutResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  logoutLocked(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authService.logoutLocked(identity, extractRequestMetadata(request));
  }

  @Post('switch-user')
  @HttpCode(HttpStatus.OK)
  @DedicatedAuthEndpoint()
  @UseGuards(LockedSessionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'End the current session and switch to another operator (Task 0014)' })
  @ApiOkResponse({ type: LogoutResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  switchUser(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authService.switchUser(identity, extractRequestMetadata(request));
  }

  @Post('session-state')
  @HttpCode(HttpStatus.OK)
  @DedicatedAuthEndpoint()
  @UseGuards(SessionStateGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Report server-authoritative workstation session state (Task 0014): locked or active',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        locked: { type: 'boolean' },
        lockedAt: { type: 'string', format: 'date-time', nullable: true },
        securityVersion: { type: 'integer' },
      },
      required: ['locked', 'lockedAt', 'securityVersion'],
    },
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  sessionState(@Req() request: MetadataHttpRequest & { sessionState?: unknown }) {
    return request.sessionState;
  }
}
