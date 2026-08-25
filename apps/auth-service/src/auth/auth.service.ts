import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';

import { UsersRepository } from '../users/users.repository';
import { PasswordService } from './password.service';
import { RegistrationService } from './registration.service';
import { TokenService } from './token.service';
import { SessionRepository } from './session.repository';
import { AuthConfigService } from './auth-config.service';
import { AuthSecurityEventService } from './auth-security-event.service';
import { GoogleIdentityVerifierService } from './google-identity-verifier.service';
import { AuthenticatedIdentity, LoginIdentity, RequestMetadata } from './auth.types';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegistrationResponseDto } from './dto/registration-response.dto';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';
const INVALID_REFRESH_MESSAGE = 'Invalid refresh credential';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly registrationService: RegistrationService,
    private readonly tokenService: TokenService,
    private readonly sessionRepository: SessionRepository,
    private readonly authConfig: AuthConfigService,
    private readonly securityEvents: AuthSecurityEventService,
    private readonly googleIdentityVerifier: GoogleIdentityVerifierService,
  ) {}

  async register(registerDto: RegisterDto): Promise<RegistrationResponseDto> {
    const response = await this.registrationService.register(registerDto);
    this.securityEvents.record('registration', {
      outcome: 'success',
      reason: 'registration-processed',
    });
    return response;
  }

  async login(loginDto: LoginDto, metadata: RequestMetadata): Promise<LoginResponseDto> {
    const loginIdentity = await this.usersRepository.findLoginIdentity(
      loginDto.tenantSlug,
      loginDto.email,
    );

    if (!loginIdentity) {
      await this.passwordService.verifyAgainstDummy(loginDto.password);
      this.recordInvalidLogin();
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordValid = await this.passwordService.verify(
      loginIdentity.user.passwordHash,
      loginDto.password,
    );
    if (!passwordValid) {
      this.recordInvalidLogin();
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (this.passwordService.needsRehash(loginIdentity.user.passwordHash)) {
      const passwordHash = await this.passwordService.hash(loginDto.password);
      await this.usersRepository.update(loginIdentity.user.id, { passwordHash });
    }

    return this.createAuthenticatedSession(loginIdentity, metadata);
  }

  async googleLogin(
    tenantSlug: string,
    idToken: string,
    metadata: RequestMetadata,
  ): Promise<LoginResponseDto> {
    const googleIdentity = await this.googleIdentityVerifier.verify(idToken);

    const loginIdentity = await this.usersRepository.findGoogleLoginIdentity(
      tenantSlug,
      googleIdentity.subject,
    );

    if (!loginIdentity) {
      this.recordInvalidLogin();
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (loginIdentity.user.email.trim().toLowerCase() !== googleIdentity.email) {
      this.recordInvalidLogin();
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    return this.createAuthenticatedSession(loginIdentity, metadata);
  }

  private async createAuthenticatedSession(
    loginIdentity: LoginIdentity,
    metadata: RequestMetadata,
  ): Promise<LoginResponseDto> {
    const now = Date.now();
    const configuration = this.authConfig.value;
    const refreshCredential = this.tokenService.issueRefreshCredential();
    const familyId = randomUUID();

    const expiresAt = new Date(now + configuration.refreshIdleTtlSeconds * 1000);
    const absoluteExpiresAt = new Date(now + configuration.refreshAbsoluteTtlSeconds * 1000);

    await this.sessionRepository.createSession({
      id: refreshCredential.sessionId,
      userId: loginIdentity.user.id,
      membershipId: loginIdentity.membershipId,
      tenantId: loginIdentity.tenantId,
      familyId,
      refreshTokenHash: refreshCredential.hash,
      expiresAt,
      absoluteExpiresAt,
      metadata,
    });

    const accessToken = this.tokenService.issueAccessToken({
      userId: loginIdentity.user.id,
      membershipId: loginIdentity.membershipId,
      tenantId: loginIdentity.tenantId,
      sessionId: refreshCredential.sessionId,
    });

    const eventContext = {
      outcome: 'success' as const,
      userId: loginIdentity.user.id,
      membershipId: loginIdentity.membershipId,
      tenantId: loginIdentity.tenantId,
      sessionId: refreshCredential.sessionId,
    };

    this.securityEvents.record('login', eventContext);
    this.securityEvents.record('session-created', eventContext);

    return {
      accessToken: accessToken.value,
      refreshToken: refreshCredential.value,
      expiresIn: accessToken.expiresIn,
      user: {
        id: loginIdentity.user.id,
        email: loginIdentity.user.email,
        firstName: loginIdentity.user.firstName,
        lastName: loginIdentity.user.lastName,
      },
      context: {
        membershipId: loginIdentity.membershipId,
        tenantId: loginIdentity.tenantId,
      },
    };
  }

  async refresh(refreshTokenDto: RefreshTokenDto, metadata: RequestMetadata) {
    const refreshParts = this.tokenService.parseRefreshCredential(refreshTokenDto.refreshToken);
    const nextCredential = this.tokenService.issueRefreshCredential();
    const rotation = await this.sessionRepository.rotateSession({
      currentSessionId: refreshParts.sessionId,
      presentedHash: this.tokenService.hashRefreshCredential(refreshTokenDto.refreshToken),
      nextSessionId: nextCredential.sessionId,
      nextRefreshTokenHash: nextCredential.hash,
      idleTtlSeconds: this.authConfig.value.refreshIdleTtlSeconds,
      metadata,
    });

    if (rotation.status === 'REPLAY_DETECTED') {
      this.securityEvents.record('refresh-replay', {
        outcome: 'denied',
        sessionId: refreshParts.sessionId,
        reason: 'refresh-replay',
      });
      throw new UnauthorizedException(INVALID_REFRESH_MESSAGE);
    }

    if (
      rotation.status === 'INVALID' ||
      rotation.status === 'EXPIRED' ||
      rotation.status === 'REVOKED' ||
      rotation.status === 'IDENTITY_DISABLED'
    ) {
      this.securityEvents.record('refresh', {
        outcome: 'denied',
        sessionId: refreshParts.sessionId,
        reason: 'invalid-refresh-credential',
      });
      throw new UnauthorizedException(INVALID_REFRESH_MESSAGE);
    }

    const accessToken = this.tokenService.issueAccessToken(rotation.identity);
    this.securityEvents.record('refresh', {
      outcome: 'success',
      ...rotation.identity,
    });

    return {
      accessToken: accessToken.value,
      refreshToken: nextCredential.value,
      expiresIn: accessToken.expiresIn,
    };
  }

  async logout(
    identity: AuthenticatedIdentity,
    metadata: RequestMetadata = {},
  ): Promise<{ message: string }> {
    await this.sessionRepository.revokeCurrentFamily(identity, metadata);
    this.securityEvents.record('logout', { outcome: 'success', ...identity });
    return { message: 'Logged out successfully' };
  }

  async logoutAllDevices(
    identity: AuthenticatedIdentity,
    metadata: RequestMetadata = {},
  ): Promise<{ revokedCount: number }> {
    const revokedCount = await this.sessionRepository.revokeAllForUser(identity, metadata);
    this.securityEvents.record('logout-all', { outcome: 'success', ...identity });
    return { revokedCount };
  }

  private recordInvalidLogin(): void {
    this.securityEvents.record('login', {
      outcome: 'denied',
      reason: 'invalid-credentials',
    });
  }
}
