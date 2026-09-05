import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';

import { AuthConfigService } from '../auth/auth-config.service';
import { PasswordService } from '../auth/password.service';
import { GoogleIdentityVerifierService } from '../auth/google-identity-verifier.service';
import { RequestMetadata } from '../auth/auth.types';
import { AuthSecurityEventService } from '../auth/auth-security-event.service';
import { PlatformRepository } from './platform.repository';
import { PlatformSessionRepository } from './platform-session.repository';
import { PlatformTokenService } from './platform-token.service';
import { PlatformInvitationService } from './platform-invitation.service';
import { PlatformAuthenticatedIdentity, PlatformAccessTokenIdentity } from './platform.types';

const INVALID_PLATFORM_LOGIN_MESSAGE = 'Invalid credentials';

export interface PlatformLoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    platformAccountId: string;
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    status: 'ACTIVE' | 'SUSPENDED';
  };
  permissions: string[];
}

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly repository: PlatformRepository,
    private readonly sessions: PlatformSessionRepository,
    private readonly tokens: PlatformTokenService,
    private readonly authConfig: AuthConfigService,
    private readonly passwordService: PasswordService,
    private readonly googleIdentityVerifier: GoogleIdentityVerifierService,
    private readonly securityEvents: AuthSecurityEventService,
    private readonly invitations: PlatformInvitationService,
  ) {}

  async login(
    email: string,
    password: string,
    metadata: RequestMetadata = {},
  ): Promise<PlatformLoginResult> {
    const user = await this.repository.findActiveUserByEmail(email);

    if (!user || !user.passwordHash) {
      await this.passwordService.verifyAgainstDummy(password);
      this.recordInvalidPlatformLogin();
      throw new UnauthorizedException(INVALID_PLATFORM_LOGIN_MESSAGE);
    }

    const passwordValid = await this.passwordService.verify(user.passwordHash, password);
    if (!passwordValid) {
      this.recordInvalidPlatformLogin();
      throw new UnauthorizedException(INVALID_PLATFORM_LOGIN_MESSAGE);
    }

    const account = await this.repository.findPlatformAccountByUserId(user.id);
    if (!account || account.status !== 'ACTIVE' || account.roleAssignments.length === 0) {
      this.recordInvalidPlatformLogin();
      throw new UnauthorizedException(INVALID_PLATFORM_LOGIN_MESSAGE);
    }

    return this.issuePlatformSession(
      account.id,
      user.id,
      user.email,
      user.firstName,
      user.lastName,
      account.status,
      metadata,
    );
  }
  async loginWithGoogle(
    idToken: string,
    metadata: RequestMetadata = {},
  ): Promise<PlatformLoginResult> {
    let googleIdentity;
    try {
      googleIdentity = await this.googleIdentityVerifier.verify(idToken);
    } catch {
      this.recordInvalidPlatformLogin();
      throw new UnauthorizedException(INVALID_PLATFORM_LOGIN_MESSAGE);
    }

    const user = await this.repository.findActiveUserByGoogleSubject(googleIdentity.subject);
    if (!user) {
      this.recordInvalidPlatformLogin();
      throw new UnauthorizedException(INVALID_PLATFORM_LOGIN_MESSAGE);
    }

    const linkedEmail = user.externalAuthIdentities.find((i) => i.emailVerified === true)?.email;
    if (!linkedEmail || linkedEmail.trim().toLowerCase() !== googleIdentity.email) {
      this.recordInvalidPlatformLogin();
      throw new UnauthorizedException(INVALID_PLATFORM_LOGIN_MESSAGE);
    }

    const account = await this.repository.findPlatformAccountByUserId(user.id);
    if (!account || account.status !== 'ACTIVE' || account.roleAssignments.length === 0) {
      this.recordInvalidPlatformLogin();
      throw new UnauthorizedException(INVALID_PLATFORM_LOGIN_MESSAGE);
    }

    return this.issuePlatformSession(
      account.id,
      user.id,
      linkedEmail,
      user.firstName,
      user.lastName,
      account.status,
      metadata,
    );
  }

  private async issuePlatformSession(
    platformAccountId: string,
    userId: string,
    email: string,
    firstName: string,
    lastName: string,
    status: 'ACTIVE' | 'SUSPENDED',
    metadata: RequestMetadata,
  ): Promise<PlatformLoginResult> {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const refresh = this.tokens.issuePlatformRefreshCredential(sessionId);
    const now = new Date();
    const idleExpiry = new Date(now.getTime() + this.authConfig.value.refreshIdleTtlSeconds * 1000);
    const absoluteExpiry = new Date(
      now.getTime() + this.authConfig.value.refreshAbsoluteTtlSeconds * 1000,
    );

    await this.sessions.createPlatformSession({
      id: sessionId,
      userId,
      familyId,
      refreshTokenHash: refresh.hash,
      expiresAt: idleExpiry,
      absoluteExpiresAt: absoluteExpiry,
      metadata,
    });

    const identity: PlatformAccessTokenIdentity = {
      userId,
      platformAccountId,
      platformSessionId: sessionId,
      securityVersion: 1,
    };
    const accessToken = this.tokens.issuePlatformAccessToken(identity);
    const permissions = await this.repository.findEffectivePlatformPermissions(platformAccountId);

    this.securityEvents.record('platform-login', {
      outcome: 'success',
      reason: 'platform-login-processed',
    });

    return {
      accessToken: accessToken.value,
      refreshToken: refresh.value,
      expiresIn: accessToken.expiresIn,
      user: { platformAccountId, userId, email, firstName, lastName, status },
      permissions,
    };
  }
  async refresh(
    refreshToken: string,
    metadata: RequestMetadata = {},
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const parts = this.tokens.parsePlatformRefreshCredential(refreshToken);
    const nextSessionId = randomUUID();
    const nextRefresh = this.tokens.issuePlatformRefreshCredential(nextSessionId);

    const result = await this.sessions.rotatePlatformSession({
      currentPlatformSessionId: parts.platformSessionId,
      presentedHash: this.tokens.hashPlatformRefreshCredential(refreshToken),
      nextPlatformSessionId: nextSessionId,
      nextRefreshTokenHash: nextRefresh.hash,
      idleTtlSeconds: this.authConfig.value.refreshIdleTtlSeconds,
      metadata,
    });

    if (result.status === 'REPLAY_DETECTED') {
      throw new UnauthorizedException('Invalid refresh credential');
    }

    if (result.status !== 'ROTATED') {
      throw new UnauthorizedException('Invalid refresh credential');
    }

    const accessToken = this.tokens.issuePlatformAccessToken(result.identity);
    return {
      accessToken: accessToken.value,
      refreshToken: nextRefresh.value,
      expiresIn: accessToken.expiresIn,
    };
  }

  async logout(
    identity: PlatformAuthenticatedIdentity,
    metadata: RequestMetadata = {},
  ): Promise<void> {
    await this.sessions.revokeCurrentPlatformFamily(identity, metadata);
  }

  /**
   * Invitation acceptance: requires BOTH a valid invitation proof AND a
   * cryptographically authenticated global AIM identity whose verified email
   * matches the invitation target. Acceptance creates/enables ONLY the
   * server-approved platform role encoded by the invitation (never the owner).
   */
  async acceptInvitation(
    dto: {
      invitationToken: string;
      googleIdToken?: string;
      email?: string;
      password?: string;
    },
    metadata: RequestMetadata = {},
  ): Promise<PlatformLoginResult> {
    const googlePath = typeof dto.googleIdToken === 'string' && dto.googleIdToken.length > 0;
    const passwordPath =
      typeof dto.password === 'string' &&
      dto.password.length > 0 &&
      typeof dto.email === 'string' &&
      dto.email.length > 0;

    if (googlePath === passwordPath) {
      throw new UnauthorizedException(INVALID_PLATFORM_LOGIN_MESSAGE);
    }

    if (passwordPath) {
      const accountResult = await this.invitations.acceptWithPassword(
        dto.invitationToken,
        (dto as { email: string }).email,
        (dto as { password: string }).password,
        metadata,
      );
      if (!accountResult) {
        throw new UnauthorizedException(INVALID_PLATFORM_LOGIN_MESSAGE);
      }
      return this.issuePlatformSession(
        accountResult.platformAccount.id,
        accountResult.platformAccount.userId,
        accountResult.platformAccount.user.email,
        accountResult.platformAccount.user.firstName,
        accountResult.platformAccount.user.lastName,
        accountResult.platformAccount.status,
        metadata,
      );
    }

    const googleIdentity = await this.googleIdentityVerifier.verify(
      (dto as { googleIdToken: string }).googleIdToken,
    );
    const accountResult = await this.invitations.acceptWithGoogle(
      dto.invitationToken,
      googleIdentity,
      metadata,
    );
    if (!accountResult) {
      throw new UnauthorizedException(INVALID_PLATFORM_LOGIN_MESSAGE);
    }
    return this.issuePlatformSession(
      accountResult.platformAccount.id,
      accountResult.platformAccount.userId,
      accountResult.platformAccount.user.email,
      accountResult.platformAccount.user.firstName,
      accountResult.platformAccount.user.lastName,
      accountResult.platformAccount.status,
      metadata,
    );
  }

  async revokeSessionsForUser(userId: string, _metadata: RequestMetadata = {}): Promise<number> {
    const revokedSessionCount = await this.sessions.revokeAllPlatformSessionsForUserId(
      userId,
      'platform-sessions-explicitly-revoked',
    );
    this.securityEvents.record('platform-session-revocation', {
      outcome: 'success',
      reason: 'platform-sessions-revoked',
    });
    return revokedSessionCount;
  }
  private recordInvalidPlatformLogin(): void {
    this.securityEvents.record('platform-login', {
      outcome: 'denied',
      reason: 'invalid-credentials',
    });
  }
}
