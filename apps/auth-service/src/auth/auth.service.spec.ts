import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { AuthConfigService } from './auth-config.service';
import { AuthSecurityEventService } from './auth-security-event.service';
import { AuthService } from './auth.service';
import { GoogleIdentityVerifierService } from './google-identity-verifier.service';
import { OrganizationOnboardingService } from '../organization/organization-onboarding.service';
import { PasswordService } from './password.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrationService } from './registration.service';
import { SessionRepository } from './session.repository';
import { TokenService } from './token.service';
import { UsersRepository } from '../users/users.repository';

describe('AuthService', () => {
  const userId = randomUUID();
  const membershipId = randomUUID();
  const tenantId = randomUUID();
  const sessionId = randomUUID();
  const nextSessionId = randomUUID();
  const tokenId = randomUUID();
  const metadata = { ipAddress: '127.0.0.1', userAgent: 'Jest' };
  const loginDto = {
    tenantSlug: 'central-pharmacy',
    email: 'user@example.com',
    password: 'a secure passphrase',
  };
  const loginIdentity = {
    user: {
      id: userId,
      email: loginDto.email,
      passwordHash: 'password-hash',
      firstName: 'Test',
      lastName: 'User',
      preferredLanguage: 'ta',
    },
    membershipId,
    tenantId,
    tenant: { name: 'Central Pharmacy', organizationType: 'PHARMACY' },
  };

  let usersRepository: jest.Mocked<UsersRepository>;
  let organizationOnboarding: jest.Mocked<OrganizationOnboardingService>;
  let passwordService: jest.Mocked<PasswordService>;
  let registrationService: jest.Mocked<RegistrationService>;
  let tokenService: jest.Mocked<TokenService>;
  let sessionRepository: jest.Mocked<SessionRepository>;
  let securityEvents: jest.Mocked<AuthSecurityEventService>;
  let googleIdentityVerifier: jest.Mocked<GoogleIdentityVerifierService>;
  let prisma: jest.Mocked<PrismaService>;
  let service: AuthService;

  beforeEach(() => {
    usersRepository = {
      findLoginIdentity: jest.fn(),
      findGoogleLoginIdentity: jest.fn(),
      createPendingGoogleRegistration: jest.fn(),
      findGlobalIdentityByEmail: jest.fn(),
      findActiveMembershipsForUser: jest.fn(),
      findLoginIdentityByMembershipId: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    organizationOnboarding = {
      registerWithPassword: jest.fn(),
      registerWithGoogle: jest.fn(),
    } as unknown as jest.Mocked<OrganizationOnboardingService>;
    passwordService = {
      verify: jest.fn(),
      verifyAgainstDummy: jest.fn(),
      hash: jest.fn(),
      needsRehash: jest.fn(),
    } as unknown as jest.Mocked<PasswordService>;
    registrationService = {
      register: jest.fn(),
    } as unknown as jest.Mocked<RegistrationService>;
    tokenService = {
      issueAccessToken: jest.fn(),
      issueRefreshCredential: jest.fn(),
      parseRefreshCredential: jest.fn(),
      hashRefreshCredential: jest.fn(),
    } as unknown as jest.Mocked<TokenService>;
    sessionRepository = {
      createSession: jest.fn(),
      rotateSession: jest.fn(),
      revokeCurrentFamily: jest.fn(),
      revokeAllForUser: jest.fn(),
      lockSession: jest.fn(),
      unlockSession: jest.fn(),
      reauthenticateSession: jest.fn(),
      revokeLockedFamily: jest.fn(),
    } as unknown as jest.Mocked<SessionRepository>;
    securityEvents = {
      record: jest.fn(),
    } as unknown as jest.Mocked<AuthSecurityEventService>;
    googleIdentityVerifier = {
      verify: jest.fn(),
    } as unknown as jest.Mocked<GoogleIdentityVerifierService>;
    prisma = {
      client: {
        externalAuthIdentity: {
          findFirst: jest.fn(),
        },
      },
    } as unknown as jest.Mocked<PrismaService>;

    service = new AuthService(
      usersRepository,
      organizationOnboarding,
      passwordService,
      registrationService,
      tokenService,
      sessionRepository,
      {
        value: {
          refreshIdleTtlSeconds: 604800,
          refreshAbsoluteTtlSeconds: 2592000,
          orgJoinCodePepper: Buffer.from('a'.repeat(64), 'hex'),
        },
      } as unknown as AuthConfigService,
      securityEvents,
      googleIdentityVerifier,
      prisma,
    );
  });

  it('creates a membership-bound session and returns no password data', async () => {
    usersRepository.findLoginIdentity.mockResolvedValue(loginIdentity);
    passwordService.verify.mockResolvedValue(true);
    passwordService.needsRehash.mockReturnValue(false);
    tokenService.issueRefreshCredential.mockReturnValue({
      value: 'opaque-refresh',
      hash: 'a'.repeat(64),
      sessionId,
    });
    tokenService.issueAccessToken.mockReturnValue({
      value: 'access-token',
      expiresIn: 900,
      tokenId,
    });

    const result = await service.login(loginDto, metadata);

    expect(usersRepository.findLoginIdentity).toHaveBeenCalledWith(
      loginDto.tenantSlug,
      loginDto.email,
    );
    expect(sessionRepository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sessionId,
        membershipId,
        tenantId,
        refreshTokenHash: 'a'.repeat(64),
        metadata,
      }),
    );
    expect(tokenService.issueAccessToken).toHaveBeenCalledWith({
      userId,
      membershipId,
      tenantId,
      sessionId,
      securityVersion: 1,
    });
    expect(result.context).toEqual({
      membershipId,
      tenantId,
      tenantName: 'Central Pharmacy',
      organizationType: 'PHARMACY',
    });
    expect(result.user.preferredLanguage).toBe('ta');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('uses one generic failure for an unknown membership and never creates a session', async () => {
    usersRepository.findLoginIdentity.mockResolvedValue(null);
    await expect(service.login(loginDto, metadata)).rejects.toThrow(
      new UnauthorizedException('Invalid credentials'),
    );
    expect(passwordService.verifyAgainstDummy).toHaveBeenCalledWith(loginDto.password);
    expect(sessionRepository.createSession).not.toHaveBeenCalled();
  });

  it('uses the same generic failure for an invalid password', async () => {
    usersRepository.findLoginIdentity.mockResolvedValue(loginIdentity);
    passwordService.verify.mockResolvedValue(false);
    await expect(service.login(loginDto, metadata)).rejects.toThrow(
      new UnauthorizedException('Invalid credentials'),
    );
    expect(sessionRepository.createSession).not.toHaveBeenCalled();
  });

  it('provisions Google onboarding only from a verified Google identity', async () => {
    googleIdentityVerifier.verify.mockResolvedValue({
      subject: 'google-subject-123',
      email: 'verified@example.com',
      emailVerified: true,
    });

    const response = await service.googleRegister({
      organizationType: 'HOSPITAL',
      organizationCode: 'MED-X7P42-Q9K3R',
      idToken: 'google-id-token',
      phone: '+919876543210',
      firstName: 'Asha',
      lastName: 'Sharma',
    });

    expect(googleIdentityVerifier.verify).toHaveBeenCalledWith('google-id-token');
    expect(organizationOnboarding.registerWithGoogle).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationType: 'HOSPITAL',
        organizationCode: 'MED-X7P42-Q9K3R',
        subject: 'google-subject-123',
        email: 'verified@example.com',
        phone: '+919876543210',
        firstName: 'Asha',
        lastName: 'Sharma',
      }),
    );
    expect(response.message).toBe(
      'If registration is available, onboarding instructions will be sent.',
    );
    expect(sessionRepository.createSession).not.toHaveBeenCalled();
  });

  it('does not provision Google onboarding when Google verification fails', async () => {
    googleIdentityVerifier.verify.mockRejectedValue(
      new UnauthorizedException('Invalid Google identity'),
    );

    await expect(
      service.googleRegister({
        organizationType: 'HOSPITAL',
        organizationCode: 'MED-X7P42-Q9K3R',
        idToken: 'invalid-google-token',
        phone: '+919876543210',
        firstName: 'Asha',
        lastName: 'Sharma',
      }),
    ).rejects.toThrow(new UnauthorizedException('Invalid Google identity'));

    expect(organizationOnboarding.registerWithGoogle).not.toHaveBeenCalled();
    expect(sessionRepository.createSession).not.toHaveBeenCalled();
  });

  it('rejects password authentication for a Google-only account without a password hash', async () => {
    usersRepository.findLoginIdentity.mockResolvedValue({
      ...loginIdentity,
      user: {
        ...loginIdentity.user,
        passwordHash: null,
      },
    });

    await expect(service.login(loginDto, metadata)).rejects.toThrow(
      new UnauthorizedException('Invalid credentials'),
    );

    expect(passwordService.verifyAgainstDummy).toHaveBeenCalledWith(loginDto.password);
    expect(passwordService.verify).not.toHaveBeenCalled();
    expect(passwordService.needsRehash).not.toHaveBeenCalled();
    expect(sessionRepository.createSession).not.toHaveBeenCalled();
  });

  it('creates the normal membership-bound session for a linked Google identity', async () => {
    googleIdentityVerifier.verify.mockResolvedValue({
      subject: 'google-subject-123',
      email: loginDto.email,
      emailVerified: true,
    });
    usersRepository.findGoogleLoginIdentity.mockResolvedValue(loginIdentity);
    tokenService.issueRefreshCredential.mockReturnValue({
      value: 'google-refresh',
      hash: 'c'.repeat(64),
      sessionId,
    });
    tokenService.issueAccessToken.mockReturnValue({
      value: 'google-access',
      expiresIn: 900,
      tokenId,
    });

    const result = await service.googleLogin(loginDto.tenantSlug, 'google-id-token', metadata);

    expect(googleIdentityVerifier.verify).toHaveBeenCalledWith('google-id-token');
    expect(usersRepository.findGoogleLoginIdentity).toHaveBeenCalledWith(
      loginDto.tenantSlug,
      'google-subject-123',
    );
    expect(sessionRepository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        membershipId,
        tenantId,
        metadata,
      }),
    );
    expect(result.accessToken).toBe('google-access');
    expect(result.context).toEqual({
      membershipId,
      tenantId,
      tenantName: 'Central Pharmacy',
      organizationType: 'PHARMACY',
    });
    expect(result.user.preferredLanguage).toBe('ta');
  });

  it('rejects an unknown Google identity without creating a session', async () => {
    googleIdentityVerifier.verify.mockResolvedValue({
      subject: 'unknown-google-subject',
      email: loginDto.email,
      emailVerified: true,
    });
    usersRepository.findGoogleLoginIdentity.mockResolvedValue(null);

    await expect(
      service.googleLogin(loginDto.tenantSlug, 'google-id-token', metadata),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));

    expect(sessionRepository.createSession).not.toHaveBeenCalled();
  });

  it('rejects a Google identity when the verified email does not match the linked user', async () => {
    googleIdentityVerifier.verify.mockResolvedValue({
      subject: 'google-subject-123',
      email: 'attacker@example.com',
      emailVerified: true,
    });
    usersRepository.findGoogleLoginIdentity.mockResolvedValue(loginIdentity);

    await expect(
      service.googleLogin(loginDto.tenantSlug, 'google-id-token', metadata),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));

    expect(sessionRepository.createSession).not.toHaveBeenCalled();
  });

  it('rotates an opaque credential and issues access for the successor session', async () => {
    tokenService.parseRefreshCredential.mockReturnValue({ sessionId, verifier: 'v'.repeat(43) });
    tokenService.hashRefreshCredential.mockReturnValue('a'.repeat(64));
    tokenService.issueRefreshCredential.mockReturnValue({
      value: 'next-refresh',
      hash: 'b'.repeat(64),
      sessionId: nextSessionId,
    });
    sessionRepository.rotateSession.mockResolvedValue({
      status: 'ROTATED',
      identity: {
        userId,
        membershipId,
        tenantId,
        sessionId: nextSessionId,
        securityVersion: 1,
      },
      expiresAt: new Date(),
      absoluteExpiresAt: new Date(),
    });
    tokenService.issueAccessToken.mockReturnValue({
      value: 'next-access',
      expiresIn: 900,
      tokenId,
    });

    await expect(service.refresh({ refreshToken: 'presented' }, metadata)).resolves.toEqual({
      accessToken: 'next-access',
      refreshToken: 'next-refresh',
      expiresIn: 900,
    });
  });

  it('rejects normal refresh when the workstation session is locked', async () => {
    tokenService.parseRefreshCredential.mockReturnValue({
      sessionId,
      verifier: 'v'.repeat(43),
    });
    tokenService.hashRefreshCredential.mockReturnValue('a'.repeat(64));
    tokenService.issueRefreshCredential.mockReturnValue({
      value: 'must-not-be-issued',
      hash: 'b'.repeat(64),
      sessionId: nextSessionId,
    });

    sessionRepository.rotateSession.mockResolvedValue({ status: 'LOCKED' });

    await expect(
      service.refresh({ refreshToken: 'locked-session-refresh' }, metadata),
    ).rejects.toThrow(UnauthorizedException);

    expect(sessionRepository.rotateSession).toHaveBeenCalled();
    expect(tokenService.issueAccessToken).not.toHaveBeenCalled();
  });

  it('rejects replay after the repository revokes the session family', async () => {
    tokenService.parseRefreshCredential.mockReturnValue({ sessionId, verifier: 'v'.repeat(43) });
    tokenService.hashRefreshCredential.mockReturnValue('a'.repeat(64));
    tokenService.issueRefreshCredential.mockReturnValue({
      value: 'unused',
      hash: 'b'.repeat(64),
      sessionId: nextSessionId,
    });
    sessionRepository.rotateSession.mockResolvedValue({ status: 'REPLAY_DETECTED' });

    await expect(service.refresh({ refreshToken: 'replayed' }, metadata)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(securityEvents.record).toHaveBeenCalledWith(
      'refresh-replay',
      expect.objectContaining({ outcome: 'denied' }),
    );
  });

  it('scopes logout and logout-all to the authenticated identity', async () => {
    const identity = { userId, membershipId, tenantId, sessionId, tokenId, securityVersion: 1 };
    sessionRepository.revokeCurrentFamily.mockResolvedValue(1);
    sessionRepository.revokeAllForUser.mockResolvedValue(3);

    await service.logout(identity);
    await expect(service.logoutAllDevices(identity)).resolves.toEqual({ revokedCount: 3 });
    expect(sessionRepository.revokeCurrentFamily).toHaveBeenCalledWith(identity, {});
    expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith(identity, {});
  });

  describe('Task 0014 workstation lock/unlock', () => {
    const identity = { userId, membershipId, tenantId, sessionId, tokenId, securityVersion: 1 };

    it('locks the workstation and records the security event', async () => {
      (sessionRepository.lockSession as jest.Mock).mockResolvedValue({ securityVersion: 2 });

      await expect(service.lock(identity, { reason: 'manual' }, metadata)).resolves.toEqual({
        locked: true,
      });
      expect(sessionRepository.lockSession).toHaveBeenCalledWith(identity, 'manual', metadata);
      expect(securityEvents.record).toHaveBeenCalledWith(
        'session-locked',
        expect.objectContaining({ outcome: 'success' }),
      );
    });

    it('unlocks with a valid password and rotates to a fresh session', async () => {
      tokenService.parseRefreshCredential.mockReturnValue({ sessionId, verifier: 'v'.repeat(43) });
      tokenService.hashRefreshCredential.mockReturnValue('a'.repeat(64));
      tokenService.issueRefreshCredential.mockReturnValue({
        value: 'next-refresh',
        hash: 'b'.repeat(64),
        sessionId: nextSessionId,
      });
      usersRepository.findLoginIdentityByMembershipId.mockResolvedValue(loginIdentity);
      passwordService.verify.mockResolvedValue(true);
      (sessionRepository.unlockSession as jest.Mock).mockResolvedValue({
        status: 'ROTATED',
        identity: { userId, membershipId, tenantId, sessionId: nextSessionId, securityVersion: 2 },
        expiresAt: new Date(),
        absoluteExpiresAt: new Date(),
      });
      tokenService.issueAccessToken.mockReturnValue({
        value: 'unlocked-access',
        expiresIn: 900,
        tokenId,
      });

      const result = await service.unlock(
        identity,
        { refreshToken: 'msr.presented', password: 'a secure passphrase' },
        metadata,
      );

      expect(passwordService.verify).toHaveBeenCalledWith('password-hash', 'a secure passphrase');
      expect(sessionRepository.unlockSession).toHaveBeenCalledWith(
        expect.objectContaining({
          currentSessionId: sessionId,
          unlockMethod: 'PASSWORD',
        }),
      );
      expect(result.accessToken).toBe('unlocked-access');
      expect(securityEvents.record).toHaveBeenCalledWith(
        'session-unlocked',
        expect.objectContaining({ outcome: 'success' }),
      );
    });

    it('rejects a wrong password and stays locked', async () => {
      tokenService.parseRefreshCredential.mockReturnValue({ sessionId, verifier: 'v'.repeat(43) });
      tokenService.hashRefreshCredential.mockReturnValue('a'.repeat(64));
      tokenService.issueRefreshCredential.mockReturnValue({
        value: 'unused',
        hash: 'b'.repeat(64),
        sessionId: nextSessionId,
      });
      usersRepository.findLoginIdentityByMembershipId.mockResolvedValue(loginIdentity);
      passwordService.verify.mockResolvedValue(false);

      await expect(
        service.unlock(identity, { refreshToken: 'msr.presented', password: 'wrong' }, metadata),
      ).rejects.toThrow(UnauthorizedException);
      expect(sessionRepository.unlockSession).not.toHaveBeenCalled();
      expect(securityEvents.record).toHaveBeenCalledWith(
        'session-unlock-failed',
        expect.objectContaining({ outcome: 'denied' }),
      );
    });

    it('rejects zero credentials and multiple credentials at the boundary', async () => {
      tokenService.parseRefreshCredential.mockReturnValue({ sessionId, verifier: 'v'.repeat(43) });
      tokenService.hashRefreshCredential.mockReturnValue('a'.repeat(64));
      tokenService.issueRefreshCredential.mockReturnValue({
        value: 'unused',
        hash: 'b'.repeat(64),
        sessionId: nextSessionId,
      });

      await expect(
        service.unlock(identity, { refreshToken: 'msr.presented' }, metadata),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.unlock(
          identity,
          { refreshToken: 'msr.presented', password: 'a secure passphrase', googleIdToken: 'g' },
          metadata,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(sessionRepository.unlockSession).not.toHaveBeenCalled();
    });

    it('fails closed when Google verification rejects the unlock proof', async () => {
      tokenService.parseRefreshCredential.mockReturnValue({ sessionId, verifier: 'v'.repeat(43) });
      tokenService.hashRefreshCredential.mockReturnValue('a'.repeat(64));
      tokenService.issueRefreshCredential.mockReturnValue({
        value: 'unused',
        hash: 'b'.repeat(64),
        sessionId: nextSessionId,
      });
      googleIdentityVerifier.verify.mockRejectedValue(
        new UnauthorizedException('Invalid Google identity'),
      );

      await expect(
        service.unlock(identity, { refreshToken: 'msr.presented', googleIdToken: 'bad' }, metadata),
      ).rejects.toThrow(UnauthorizedException);
      expect(sessionRepository.unlockSession).not.toHaveBeenCalled();
    });

    it('unlocks with a verified Google identity linked to the same user', async () => {
      tokenService.parseRefreshCredential.mockReturnValue({ sessionId, verifier: 'v'.repeat(43) });
      tokenService.hashRefreshCredential.mockReturnValue('a'.repeat(64));
      tokenService.issueRefreshCredential.mockReturnValue({
        value: 'next-refresh',
        hash: 'b'.repeat(64),
        sessionId: nextSessionId,
      });
      usersRepository.findLoginIdentityByMembershipId.mockResolvedValue(loginIdentity);
      googleIdentityVerifier.verify.mockResolvedValue({
        subject: 'google-subject-123',
        email: loginDto.email,
        emailVerified: true,
      });
      (prisma.client.externalAuthIdentity.findFirst as jest.Mock).mockResolvedValue({ id: 'x' });
      (sessionRepository.unlockSession as jest.Mock).mockResolvedValue({
        status: 'ROTATED',
        identity: { userId, membershipId, tenantId, sessionId: nextSessionId, securityVersion: 2 },
        expiresAt: new Date(),
        absoluteExpiresAt: new Date(),
      });
      tokenService.issueAccessToken.mockReturnValue({
        value: 'google-unlocked-access',
        expiresIn: 900,
        tokenId,
      });

      const result = await service.unlock(
        identity,
        { refreshToken: 'msr.presented', googleIdToken: 'valid-google' },
        metadata,
      );

      expect(googleIdentityVerifier.verify).toHaveBeenCalledWith('valid-google');
      expect(sessionRepository.unlockSession).toHaveBeenCalledWith(
        expect.objectContaining({ unlockMethod: 'GOOGLE' }),
      );
      expect(result.accessToken).toBe('google-unlocked-access');
    });

    it('rejects a Google identity that is not linked to the same user', async () => {
      tokenService.parseRefreshCredential.mockReturnValue({ sessionId, verifier: 'v'.repeat(43) });
      tokenService.hashRefreshCredential.mockReturnValue('a'.repeat(64));
      tokenService.issueRefreshCredential.mockReturnValue({
        value: 'unused',
        hash: 'b'.repeat(64),
        sessionId: nextSessionId,
      });
      usersRepository.findLoginIdentityByMembershipId.mockResolvedValue(loginIdentity);
      googleIdentityVerifier.verify.mockResolvedValue({
        subject: 'attacker-subject',
        email: 'attacker@example.com',
        emailVerified: true,
      });
      (prisma.client.externalAuthIdentity.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.unlock(
          identity,
          { refreshToken: 'msr.presented', googleIdToken: 'other' },
          metadata,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(sessionRepository.unlockSession).not.toHaveBeenCalled();
    });

    it('re-authenticates an active session with the same user password', async () => {
      usersRepository.findLoginIdentityByMembershipId.mockResolvedValue(loginIdentity);
      passwordService.verify.mockResolvedValue(true);
      (sessionRepository.reauthenticateSession as jest.Mock).mockResolvedValue({
        recentAuthenticatedAt: new Date('2026-09-02T08:00:00.000Z'),
      });

      const result = await service.reauthenticate(
        identity,
        { password: 'correct-password-123' },
        metadata,
      );

      expect(sessionRepository.reauthenticateSession).toHaveBeenCalledWith(
        identity,
        'PASSWORD',
        metadata,
      );
      expect(result).toEqual({
        reauthenticated: true,
        recentAuthenticatedAt: new Date('2026-09-02T08:00:00.000Z'),
      });
    });

    it('re-authenticates an active session with the same linked Google identity', async () => {
      usersRepository.findLoginIdentityByMembershipId.mockResolvedValue(loginIdentity);
      googleIdentityVerifier.verify.mockResolvedValue({
        subject: 'google-subject-123',
        email: loginDto.email,
        emailVerified: true,
      });
      (prisma.client.externalAuthIdentity.findFirst as jest.Mock).mockResolvedValue({ id: 'x' });
      (sessionRepository.reauthenticateSession as jest.Mock).mockResolvedValue({
        recentAuthenticatedAt: new Date('2026-09-02T08:01:00.000Z'),
      });

      await expect(
        service.reauthenticate(identity, { googleIdToken: 'valid-google' }, metadata),
      ).resolves.toMatchObject({ reauthenticated: true });

      expect(sessionRepository.reauthenticateSession).toHaveBeenCalledWith(
        identity,
        'GOOGLE',
        metadata,
      );
    });

    it('rejects failed re-authentication without advancing recent-auth state', async () => {
      usersRepository.findLoginIdentityByMembershipId.mockResolvedValue(loginIdentity);
      passwordService.verify.mockResolvedValue(false);

      await expect(
        service.reauthenticate(identity, { password: 'wrong-password-123' }, metadata),
      ).rejects.toThrow(UnauthorizedException);

      expect(sessionRepository.reauthenticateSession).not.toHaveBeenCalled();
    });

    it('revokes the locked family on locked logout', async () => {
      (sessionRepository.revokeLockedFamily as jest.Mock).mockResolvedValue(2);

      const result = await service.logoutLocked(identity, metadata);

      expect(result).toEqual({ message: 'Logged out successfully', revokedCount: 2 });
      expect(sessionRepository.revokeLockedFamily).toHaveBeenCalledWith(
        identity,
        metadata,
        'authentication.session.logout.locked',
      );
      expect(securityEvents.record).toHaveBeenCalledWith(
        'logout-locked',
        expect.objectContaining({ outcome: 'success' }),
      );
    });

    it('ends the old session on switch-user', async () => {
      (sessionRepository.revokeLockedFamily as jest.Mock).mockResolvedValue(1);

      const result = await service.switchUser(identity, metadata);

      expect(result).toEqual({
        message: 'Session ended. Sign in as the next operator.',
        revokedCount: 1,
      });
      expect(sessionRepository.revokeLockedFamily).toHaveBeenCalledWith(
        identity,
        metadata,
        'authentication.session.switched',
      );
      expect(securityEvents.record).toHaveBeenCalledWith(
        'switch-user',
        expect.objectContaining({ outcome: 'success' }),
      );
    });
  });

  describe('identifyLogin (Task 0010 slug-free login, step 1)', () => {
    const identifyDto = { email: loginDto.email, password: loginDto.password };
    const globalIdentity = {
      id: userId,
      email: loginDto.email,
      passwordHash: 'password-hash',
      firstName: 'Test',
      lastName: 'User',
    };

    beforeEach(() => {
      passwordService.verify.mockResolvedValue(true);
      passwordService.needsRehash.mockReturnValue(false);
      tokenService.issueRefreshCredential.mockReturnValue({
        value: 'opaque-refresh',
        hash: 'a'.repeat(64),
        sessionId,
      });
      tokenService.issueAccessToken.mockReturnValue({
        value: 'access-token',
        expiresIn: 900,
        tokenId,
      });
    });

    it('never collects or requires a tenant slug', () => {
      expect(identifyDto).not.toHaveProperty('tenantSlug');
    });

    it('logs the person in directly when exactly one active membership exists', async () => {
      usersRepository.findGlobalIdentityByEmail.mockResolvedValue(globalIdentity);
      usersRepository.findActiveMembershipsForUser.mockResolvedValue([
        {
          membershipId,
          tenantId,
          organizationName: 'Central Hospital',
          organizationType: 'HOSPITAL',
        },
      ]);
      usersRepository.findLoginIdentityByMembershipId.mockResolvedValue(loginIdentity);

      const result = await service.identifyLogin(identifyDto, metadata);

      expect(result).not.toHaveProperty('requiresOrganizationSelection');
      expect((result as { context: unknown }).context).toEqual({
        membershipId,
        tenantId,
        tenantName: 'Central Pharmacy',
        organizationType: 'PHARMACY',
      });
    });

    it('returns only bounded organization display info -- never a general org search -- when multiple memberships exist', async () => {
      usersRepository.findGlobalIdentityByEmail.mockResolvedValue(globalIdentity);
      usersRepository.findActiveMembershipsForUser.mockResolvedValue([
        {
          membershipId,
          tenantId,
          organizationName: 'Central Hospital',
          organizationType: 'HOSPITAL',
        },
        {
          membershipId: 'membership-2',
          tenantId: 'tenant-2',
          organizationName: 'Riverside Pharmacy',
          organizationType: 'PHARMACY',
        },
      ]);

      const result = await service.identifyLogin(identifyDto, metadata);

      expect(result).toMatchObject({
        requiresOrganizationSelection: true,
        organizations: [
          { membershipId, organizationName: 'Central Hospital', organizationType: 'HOSPITAL' },
          {
            membershipId: 'membership-2',
            organizationName: 'Riverside Pharmacy',
            organizationType: 'PHARMACY',
          },
        ],
      });
      expect(usersRepository.findLoginIdentityByMembershipId).not.toHaveBeenCalled();
    });

    it('fails with one generic message for an unknown email, identically to a wrong password', async () => {
      usersRepository.findGlobalIdentityByEmail.mockResolvedValue(null);

      await expect(service.identifyLogin(identifyDto, metadata)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(passwordService.verifyAgainstDummy).toHaveBeenCalledWith(identifyDto.password);
    });

    it('fails with the same generic message for a verified identity with zero active memberships', async () => {
      usersRepository.findGlobalIdentityByEmail.mockResolvedValue(globalIdentity);
      usersRepository.findActiveMembershipsForUser.mockResolvedValue([]);

      await expect(service.identifyLogin(identifyDto, metadata)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails for an incorrect password without revealing whether the email exists', async () => {
      usersRepository.findGlobalIdentityByEmail.mockResolvedValue(globalIdentity);
      passwordService.verify.mockResolvedValue(false);

      await expect(service.identifyLogin(identifyDto, metadata)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersRepository.findActiveMembershipsForUser).not.toHaveBeenCalled();
    });
  });

  describe('selectOrganizationLogin (Task 0010 slug-free login, step 2)', () => {
    const selectDto = { email: loginDto.email, password: loginDto.password, membershipId };
    const globalIdentity = {
      id: userId,
      email: loginDto.email,
      passwordHash: 'password-hash',
      firstName: 'Test',
      lastName: 'User',
    };

    beforeEach(() => {
      tokenService.issueRefreshCredential.mockReturnValue({
        value: 'opaque-refresh',
        hash: 'a'.repeat(64),
        sessionId,
      });
      tokenService.issueAccessToken.mockReturnValue({
        value: 'access-token',
        expiresIn: 900,
        tokenId,
      });
    });

    it('re-verifies the password rather than trusting a bare membershipId', async () => {
      usersRepository.findGlobalIdentityByEmail.mockResolvedValue(globalIdentity);
      passwordService.verify.mockResolvedValue(false);

      await expect(service.selectOrganizationLogin(selectDto, metadata)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersRepository.findLoginIdentityByMembershipId).not.toHaveBeenCalled();
    });

    it('issues a session only for a membership that resolves to the verified userId', async () => {
      usersRepository.findGlobalIdentityByEmail.mockResolvedValue(globalIdentity);
      passwordService.verify.mockResolvedValue(true);
      usersRepository.findLoginIdentityByMembershipId.mockResolvedValue(loginIdentity);

      const result = await service.selectOrganizationLogin(selectDto, metadata);

      expect(usersRepository.findLoginIdentityByMembershipId).toHaveBeenCalledWith(
        userId,
        membershipId,
      );
      expect(result.context).toEqual({
        membershipId,
        tenantId,
        tenantName: 'Central Pharmacy',
        organizationType: 'PHARMACY',
      });
    });

    it('fails closed when the membership does not belong to the verified user (cross-account guard)', async () => {
      usersRepository.findGlobalIdentityByEmail.mockResolvedValue(globalIdentity);
      passwordService.verify.mockResolvedValue(true);
      usersRepository.findLoginIdentityByMembershipId.mockResolvedValue(null);

      await expect(service.selectOrganizationLogin(selectDto, metadata)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
