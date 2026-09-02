import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';

import { UsersRepository } from '../users/users.repository';
import { OrganizationOnboardingService } from '../organization/organization-onboarding.service';
import { PasswordService } from './password.service';
import { RegistrationService } from './registration.service';
import { TokenService } from './token.service';
import { SessionRepository } from './session.repository';
import { AuthConfigService } from './auth-config.service';
import { AuthSecurityEventService } from './auth-security-event.service';
import { GoogleIdentityVerifierService } from './google-identity-verifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedIdentity, LoginIdentity, RequestMetadata } from './auth.types';
import { RegisterDto } from './dto/register.dto';
import { GoogleRegisterDto } from './dto/google-register.dto';
import { LoginDto } from './dto/login.dto';
import { IdentifyLoginDto } from './dto/identify-login.dto';
import { SelectOrganizationLoginDto } from './dto/select-organization-login.dto';
import { OrganizationSelectionRequiredDto } from './dto/organization-selection-required.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegistrationResponseDto } from './dto/registration-response.dto';
import { LockSessionDto } from './dto/lock-session.dto';
import { UnlockSessionDto } from './dto/unlock-session.dto';
import { ReauthenticateSessionDto } from './dto/reauthenticate-session.dto';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';
const INVALID_REFRESH_MESSAGE = 'Invalid refresh credential';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly organizationOnboarding: OrganizationOnboardingService,
    private readonly passwordService: PasswordService,
    private readonly registrationService: RegistrationService,
    private readonly tokenService: TokenService,
    private readonly sessionRepository: SessionRepository,
    private readonly authConfig: AuthConfigService,
    private readonly securityEvents: AuthSecurityEventService,
    private readonly googleIdentityVerifier: GoogleIdentityVerifierService,
    private readonly prisma: PrismaService,
  ) {}

  async register(registerDto: RegisterDto): Promise<RegistrationResponseDto> {
    const response = await this.registrationService.register(registerDto);
    this.securityEvents.record('registration', {
      outcome: 'success',
      reason: 'registration-processed',
    });
    return response;
  }

  async googleRegister(googleRegisterDto: GoogleRegisterDto): Promise<RegistrationResponseDto> {
    const googleIdentity = await this.googleIdentityVerifier.verify(googleRegisterDto.idToken);

    await this.organizationOnboarding.registerWithGoogle({
      organizationType: googleRegisterDto.organizationType,
      organizationCode: googleRegisterDto.organizationCode,
      subject: googleIdentity.subject,
      email: googleIdentity.email,
      phone: googleRegisterDto.phone,
      firstName: googleRegisterDto.firstName,
      lastName: googleRegisterDto.lastName,
      orgJoinCodePepper: this.authConfig.value.orgJoinCodePepper,
    });

    this.securityEvents.record('registration', {
      outcome: 'success',
      reason: 'registration-processed',
    });

    return new RegistrationResponseDto();
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

    if (!loginIdentity.user.passwordHash) {
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

  /**
   * Task 0010: slug-free login, step 1. Verifies the person's individual
   * identity (email + password) with no organization context at all,
   * then resolves only the memberships that belong to that now-verified
   * identity -- never a tenant search. Exactly one active membership
   * logs the person in directly, identically to the legacy tenantSlug
   * flow's outcome; more than one requires an explicit follow-up
   * selection (see selectOrganizationLogin); zero is treated identically
   * to invalid credentials, so an attacker cannot use this endpoint to
   * learn whether an email exists independently of its password.
   */
  async identifyLogin(
    identifyLoginDto: IdentifyLoginDto,
    metadata: RequestMetadata,
  ): Promise<LoginResponseDto | OrganizationSelectionRequiredDto> {
    const identity = await this.usersRepository.findGlobalIdentityByEmail(identifyLoginDto.email);

    if (!identity || !identity.passwordHash) {
      await this.passwordService.verifyAgainstDummy(identifyLoginDto.password);
      this.recordInvalidLogin();
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordValid = await this.passwordService.verify(
      identity.passwordHash,
      identifyLoginDto.password,
    );
    if (!passwordValid) {
      this.recordInvalidLogin();
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (this.passwordService.needsRehash(identity.passwordHash)) {
      const passwordHash = await this.passwordService.hash(identifyLoginDto.password);
      await this.usersRepository.update(identity.id, { passwordHash });
    }

    const memberships = await this.usersRepository.findActiveMembershipsForUser(identity.id);

    if (memberships.length === 0) {
      // A verified identity with no active organization membership is
      // not distinguishable, from the outside, from a wrong password --
      // both fail identically.
      this.recordInvalidLogin();
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (memberships.length === 1) {
      const loginIdentity = await this.usersRepository.findLoginIdentityByMembershipId(
        identity.id,
        memberships[0].membershipId,
      );
      if (!loginIdentity) {
        this.recordInvalidLogin();
        throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
      }
      return this.createAuthenticatedSession(loginIdentity, metadata);
    }

    const response = new OrganizationSelectionRequiredDto();
    response.organizations = memberships.map((membership) => ({
      membershipId: membership.membershipId,
      organizationName: membership.organizationName,
      organizationType: membership.organizationType,
    }));
    return response;
  }

  /**
   * Task 0010: slug-free login, step 2 (only reached when identifyLogin
   * found more than one active membership). Re-verifies the password --
   * a membershipId is never trusted alone -- then issues a session for
   * that specific membership, scoped by both membershipId AND the
   * verified userId so a membership belonging to a different account can
   * never be selected.
   */
  async selectOrganizationLogin(
    dto: SelectOrganizationLoginDto,
    metadata: RequestMetadata,
  ): Promise<LoginResponseDto> {
    const identity = await this.usersRepository.findGlobalIdentityByEmail(dto.email);
    if (!identity || !identity.passwordHash) {
      await this.passwordService.verifyAgainstDummy(dto.password);
      this.recordInvalidLogin();
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordValid = await this.passwordService.verify(identity.passwordHash, dto.password);
    if (!passwordValid) {
      this.recordInvalidLogin();
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const loginIdentity = await this.usersRepository.findLoginIdentityByMembershipId(
      identity.id,
      dto.membershipId,
    );
    if (!loginIdentity) {
      this.recordInvalidLogin();
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
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
      securityVersion: 1,
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
        preferredLanguage: loginIdentity.user.preferredLanguage,
      },
      context: {
        membershipId: loginIdentity.membershipId,
        tenantId: loginIdentity.tenantId,
        tenantName: loginIdentity.tenant.name,
        organizationType: loginIdentity.tenant.organizationType,
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
      rotation.status === 'IDENTITY_DISABLED' ||
      rotation.status === 'LOCKED'
    ) {
      this.securityEvents.record('refresh', {
        outcome: 'denied',
        sessionId: refreshParts.sessionId,
        reason: rotation.status === 'LOCKED' ? 'session-locked' : 'invalid-refresh-credential',
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

  /**
   * Task 0014: explicit workstation lock. The session stays ACTIVE
   * (server-authoritative) but is marked locked and its securityVersion is
   * incremented so every previously issued access token fails closed.
   */
  async lock(
    identity: AuthenticatedIdentity,
    lockSessionDto: LockSessionDto,
    metadata: RequestMetadata = {},
  ): Promise<{ locked: true }> {
    await this.sessionRepository.lockSession(identity, lockSessionDto.reason, metadata);
    this.securityEvents.record('session-locked', { outcome: 'success', ...identity });
    return { locked: true };
  }

  /**
   * Task 0014: secure unlock / re-authentication. Unlock proves the SAME
   * authenticated operator's identity and consumes the CURRENT locked
   * session's opaque refresh credential before rotating to a fresh session.
   *
   * Exact-one-credential enforcement is handled at the DTO boundary:
   * exactly one of password OR Google identity token must be present, never
   * zero and never both. Google verification runs through the same server-side
   * verifier used everywhere else and fails closed on any verifier rejection.
   */
  async unlock(
    identity: AuthenticatedIdentity,
    unlockSessionDto: UnlockSessionDto,
    metadata: RequestMetadata = {},
  ): Promise<LoginResponseDto> {
    const refreshParts = this.tokenService.parseRefreshCredential(unlockSessionDto.refreshToken);

    let unlockMethod: string | null;

    try {
      unlockMethod = await this.resolveSameUserCredentialMethod(unlockSessionDto, identity);
    } catch (error) {
      this.auditUnlockFailure(identity, refreshParts.sessionId, metadata);
      throw error;
    }

    if (!unlockMethod) {
      this.auditUnlockFailure(identity, refreshParts.sessionId, metadata);
      throw new UnauthorizedException('Invalid unlock credential');
    }

    const nextCredential = this.tokenService.issueRefreshCredential();
    const rotation = await this.sessionRepository.unlockSession({
      currentSessionId: refreshParts.sessionId,
      presentedHash: this.tokenService.hashRefreshCredential(unlockSessionDto.refreshToken),
      nextSessionId: nextCredential.sessionId,
      nextRefreshTokenHash: nextCredential.hash,
      unlockMethod,
      idleTtlSeconds: this.authConfig.value.refreshIdleTtlSeconds,
      metadata,
    });

    if (rotation.status !== 'ROTATED') {
      this.auditUnlockFailure(identity, refreshParts.sessionId, metadata);
      throw new UnauthorizedException('Invalid unlock credential');
    }

    const loginIdentity = await this.usersRepository.findLoginIdentityByMembershipId(
      identity.userId,
      identity.membershipId,
    );
    if (!loginIdentity) {
      throw new UnauthorizedException('Invalid unlock credential');
    }

    const accessToken = this.tokenService.issueAccessToken(rotation.identity);
    this.securityEvents.record('session-unlocked', { outcome: 'success', ...identity });

    return {
      accessToken: accessToken.value,
      refreshToken: nextCredential.value,
      expiresIn: accessToken.expiresIn,
      user: {
        id: loginIdentity.user.id,
        email: loginIdentity.user.email,
        firstName: loginIdentity.user.firstName,
        lastName: loginIdentity.user.lastName,
        preferredLanguage: loginIdentity.user.preferredLanguage,
      },
      context: {
        membershipId: loginIdentity.membershipId,
        tenantId: loginIdentity.tenantId,
        tenantName: loginIdentity.tenant.name,
        organizationType: loginIdentity.tenant.organizationType,
      },
    };
  }

  /**
   * Task 0014: explicit recent-authentication proof for an already-active
   * session. A normal refresh never reaches this path and therefore cannot
   * extend the recent-authentication window.
   */
  async reauthenticate(
    identity: AuthenticatedIdentity,
    dto: ReauthenticateSessionDto,
    metadata: RequestMetadata = {},
  ): Promise<{ reauthenticated: true; recentAuthenticatedAt: Date }> {
    let method: string | null;

    try {
      method = await this.resolveSameUserCredentialMethod(dto, identity);
    } catch (error) {
      this.securityEvents.record('session-reauthentication-failed', {
        outcome: 'denied',
        ...identity,
        reason: 'invalid-reauthentication-credential',
      });
      throw error;
    }

    if (!method) {
      this.securityEvents.record('session-reauthentication-failed', {
        outcome: 'denied',
        ...identity,
        reason: 'invalid-reauthentication-credential',
      });
      throw new UnauthorizedException('Invalid re-authentication credential');
    }

    const result = await this.sessionRepository.reauthenticateSession(identity, method, metadata);

    if (!result) {
      this.securityEvents.record('session-reauthentication-failed', {
        outcome: 'denied',
        ...identity,
        reason: 'invalid-reauthentication-credential',
      });
      throw new UnauthorizedException('Authentication required');
    }

    this.securityEvents.record('session-reauthenticated', {
      outcome: 'success',
      ...identity,
    });

    return {
      reauthenticated: true,
      recentAuthenticatedAt: result.recentAuthenticatedAt,
    };
  }

  /**
   * Task 0014: logout while the workstation is locked. Revokes the locked
   * session family server-side so a copied/stale credential cannot resume it.
   */
  async logoutLocked(
    identity: AuthenticatedIdentity,
    metadata: RequestMetadata = {},
  ): Promise<{ message: string; revokedCount: number }> {
    const revokedCount = await this.sessionRepository.revokeLockedFamily(
      identity,
      metadata,
      'authentication.session.logout.locked',
    );
    this.securityEvents.record('logout-locked', { outcome: 'success', ...identity });
    return { message: 'Logged out successfully', revokedCount };
  }

  /**
   * Task 0014: switch user on a shared workstation. The prior session is
   * securely ended/revoked server-side before the next operator is allowed
   * a fresh authenticated workspace. No "user picker" preserves multiple
   * active healthcare identities in frontend memory.
   */
  async switchUser(
    identity: AuthenticatedIdentity,
    metadata: RequestMetadata = {},
  ): Promise<{ message: string; revokedCount: number }> {
    const revokedCount = await this.sessionRepository.revokeLockedFamily(
      identity,
      metadata,
      'authentication.session.switched',
    );
    this.securityEvents.record('switch-user', { outcome: 'success', ...identity });
    return { message: 'Session ended. Sign in as the next operator.', revokedCount };
  }

  private auditUnlockFailure(
    identity: AuthenticatedIdentity,
    sessionId: string,
    _metadata: RequestMetadata,
  ): void {
    // The durable audit event for unlock failure is written by
    // SessionRepository.unlockSession inside the transaction. This
    // security-event seam records only the bounded structured log line
    // without sensitive details.
    this.securityEvents.record('session-unlock-failed', {
      outcome: 'denied',
      userId: identity.userId,
      membershipId: identity.membershipId,
      tenantId: identity.tenantId,
      sessionId,
      reason: 'invalid-unlock-credential',
    });
  }

  /**
   * Task 0014: verifies the same-operator credential proof for unlock.
   *
   * Exactly one credential mechanism is expected (enforced at DTO
   * validation); this method never accepts zero or conflates both. A
   * Google proof goes through the same server-side verifier used for
   * login -- it is never trusted client-side -- and any verifier
   * rejection leaves the workstation locked (fail-closed, no downgrade).
   */
  private async resolveSameUserCredentialMethod(
    dto: Pick<UnlockSessionDto, 'password' | 'googleIdToken'>,
    identity: AuthenticatedIdentity,
  ): Promise<string | null> {
    const password =
      typeof dto.password === 'string' && dto.password.trim().length > 0 ? dto.password : null;
    const googleIdToken =
      typeof dto.googleIdToken === 'string' && dto.googleIdToken.trim().length > 0
        ? dto.googleIdToken
        : null;

    if ((password === null) === (googleIdToken === null)) {
      // Either zero or both; both are invalid at the boundary. This line
      // is a defensive second gate even though DTO validation already
      // rejects these shapes.
      return null;
    }

    if (password !== null) {
      const loginIdentity = await this.usersRepository.findLoginIdentityByMembershipId(
        identity.userId,
        identity.membershipId,
      );
      if (!loginIdentity || !loginIdentity.user.passwordHash) {
        await this.passwordService.verifyAgainstDummy(password);
        return null;
      }
      const valid = await this.passwordService.verify(loginIdentity.user.passwordHash, password);
      return valid ? 'PASSWORD' : null;
    }

    if (googleIdToken === null) {
      return null;
    }

    // Google proof: server-side verification only. Any rejection (bad
    // token, verifier unavailable, missing configured client) propagates
    // as an UnauthorizedException and the workstation stays locked.
    const googleIdentity = await this.googleIdentityVerifier.verify(googleIdToken);

    const matchingIdentity = await this.usersRepository.findLoginIdentityByMembershipId(
      identity.userId,
      identity.membershipId,
    );
    if (!matchingIdentity) {
      return null;
    }

    const hasLinkedGoogle = await this.hasLinkedGoogleSubject(
      identity.userId,
      googleIdentity.subject,
    );
    if (!hasLinkedGoogle) {
      return null;
    }

    if (matchingIdentity.user.email.trim().toLowerCase() !== googleIdentity.email) {
      return null;
    }

    return 'GOOGLE';
  }

  private async hasLinkedGoogleSubject(userId: string, subject: string): Promise<boolean> {
    const linked = await this.prisma.client.externalAuthIdentity.findFirst({
      where: { userId, provider: 'GOOGLE', subject },
      select: { id: true },
    });
    return linked !== null;
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
