import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { AuthConfigService } from './auth-config.service';
import { AuthSecurityEventService } from './auth-security-event.service';
import { AuthService } from './auth.service';
import { GoogleIdentityVerifierService } from './google-identity-verifier.service';
import { PasswordService } from './password.service';
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
    },
    membershipId,
    tenantId,
  };

  let usersRepository: jest.Mocked<UsersRepository>;
  let passwordService: jest.Mocked<PasswordService>;
  let registrationService: jest.Mocked<RegistrationService>;
  let tokenService: jest.Mocked<TokenService>;
  let sessionRepository: jest.Mocked<SessionRepository>;
  let securityEvents: jest.Mocked<AuthSecurityEventService>;
  let googleIdentityVerifier: jest.Mocked<GoogleIdentityVerifierService>;
  let service: AuthService;

  beforeEach(() => {
    usersRepository = {
      findLoginIdentity: jest.fn(),
      findGoogleLoginIdentity: jest.fn(),
      createPendingGoogleRegistration: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
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
    } as unknown as jest.Mocked<SessionRepository>;
    securityEvents = {
      record: jest.fn(),
    } as unknown as jest.Mocked<AuthSecurityEventService>;
    googleIdentityVerifier = {
      verify: jest.fn(),
    } as unknown as jest.Mocked<GoogleIdentityVerifierService>;

    service = new AuthService(
      usersRepository,
      passwordService,
      registrationService,
      tokenService,
      sessionRepository,
      {
        value: {
          refreshIdleTtlSeconds: 604800,
          refreshAbsoluteTtlSeconds: 2592000,
        },
      } as unknown as AuthConfigService,
      securityEvents,
      googleIdentityVerifier,
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
    });
    expect(result.context).toEqual({ membershipId, tenantId });
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
      tenantSlug: 'central-pharmacy',
      idToken: 'google-id-token',
      firstName: 'Asha',
      lastName: 'Sharma',
    });

    expect(googleIdentityVerifier.verify).toHaveBeenCalledWith('google-id-token');
    expect(usersRepository.createPendingGoogleRegistration).toHaveBeenCalledWith({
      tenantSlug: 'central-pharmacy',
      subject: 'google-subject-123',
      email: 'verified@example.com',
      firstName: 'Asha',
      lastName: 'Sharma',
    });
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
        tenantSlug: 'central-pharmacy',
        idToken: 'invalid-google-token',
        firstName: 'Asha',
        lastName: 'Sharma',
      }),
    ).rejects.toThrow(new UnauthorizedException('Invalid Google identity'));

    expect(usersRepository.createPendingGoogleRegistration).not.toHaveBeenCalled();
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
    expect(result.context).toEqual({ membershipId, tenantId });
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
      identity: { userId, membershipId, tenantId, sessionId: nextSessionId },
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
    const identity = { userId, membershipId, tenantId, sessionId, tokenId };
    sessionRepository.revokeCurrentFamily.mockResolvedValue(1);
    sessionRepository.revokeAllForUser.mockResolvedValue(3);

    await service.logout(identity);
    await expect(service.logoutAllDevices(identity)).resolves.toEqual({ revokedCount: 3 });
    expect(sessionRepository.revokeCurrentFamily).toHaveBeenCalledWith(identity, {});
    expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith(identity, {});
  });
});
