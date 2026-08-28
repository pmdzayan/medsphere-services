import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { PublicEndpoint } from '@medsphere/common';
import { Throttle } from '@nestjs/throttler';
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
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { IdentifyLoginDto } from './dto/identify-login.dto';
import { SelectOrganizationLoginDto } from './dto/select-organization-login.dto';
import { OrganizationSelectionRequiredDto } from './dto/organization-selection-required.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleRegisterDto } from './dto/google-register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
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
}
