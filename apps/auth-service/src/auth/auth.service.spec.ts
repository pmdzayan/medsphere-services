import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';
import { RegistrationService } from './registration.service';
import { TokenService } from './token.service';
import { SessionRepository } from './session.repository';
import { UsersRepository } from '../users/users.repository';
import { PasswordService } from './password.service';

describe('AuthService', () => {
  let authService: AuthService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let passwordService: jest.Mocked<PasswordService>;
  let registrationService: jest.Mocked<RegistrationService>;
  let tokenService: jest.Mocked<TokenService>;
  let sessionRepository: jest.Mocked<SessionRepository>;

  const tenantId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '660e8400-e29b-41d4-a716-446655440001';

  const baseUser = {
    id: userId,
    tenantId,
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    firstName: 'John',
    lastName: 'Doe',
    phone: null,
    status: 'ACTIVE' as const,
    version: 1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersRepository,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: PasswordService,
          useValue: {
            hash: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: RegistrationService,
          useValue: {
            register: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            generateAccessToken: jest.fn(),
            generateRefreshToken: jest.fn(),
            verifyAccessToken: jest.fn(),
            verifyRefreshToken: jest.fn(),
            decode: jest.fn(),
          },
        },
        {
          provide: SessionRepository,
          useValue: {
            createSession: jest.fn(),
            findById: jest.fn(),
            findByRefreshToken: jest.fn(),
            revokeSession: jest.fn(),
            revokeAllUserSessions: jest.fn(),
            deleteExpiredSessions: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    usersRepository = module.get(UsersRepository);
    passwordService = module.get(PasswordService);
    registrationService = module.get(RegistrationService);
    tokenService = module.get(TokenService);
    sessionRepository = module.get(SessionRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Registration ────────────────────────────────────────────────────

  describe('register', () => {
    const registerDto = {
      tenantId,
      email: 'new@example.com',
      password: 'password123',
      firstName: 'Jane',
      lastName: 'Doe',
    };

    it('should register a new user successfully', async () => {
      const expectedResponse = {
        id: 'new-id',
        email: 'new@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        status: 'PENDING_VERIFICATION',
        createdAt: new Date(),
      };

      registrationService.register.mockResolvedValue(expectedResponse);

      const result = await authService.register(registerDto);

      expect(result).toEqual(expectedResponse);
      expect(registrationService.register).toHaveBeenCalledWith(registerDto);
    });

    it('should throw ConflictException for duplicate email', async () => {
      registrationService.register.mockRejectedValue(new ConflictException('User already exists'));

      await expect(authService.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });

  // ─── Login ───────────────────────────────────────────────────────────

  describe('login', () => {
    const loginDto = {
      tenantId,
      email: 'test@example.com',
      password: 'correct-password',
    };

    it('should login successfully and return tokens', async () => {
      usersRepository.findByEmail.mockResolvedValue(baseUser);
      passwordService.verify.mockResolvedValue(true);
      tokenService.generateAccessToken.mockReturnValue('access-token');
      tokenService.generateRefreshToken.mockReturnValue('refresh-token');
      sessionRepository.createSession.mockResolvedValue(undefined);

      const result = await authService.login(loginDto);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.expiresIn).toBe(900);
      expect(result.user).toEqual({
        id: userId,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException when user is inactive', async () => {
      usersRepository.findByEmail.mockResolvedValue({
        ...baseUser,
        status: 'INACTIVE',
      });

      await expect(authService.login(loginDto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is suspended', async () => {
      usersRepository.findByEmail.mockResolvedValue({
        ...baseUser,
        status: 'SUSPENDED',
      });

      await expect(authService.login(loginDto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      usersRepository.findByEmail.mockResolvedValue(baseUser);
      passwordService.verify.mockResolvedValue(false);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── Refresh ─────────────────────────────────────────────────────────

  describe('refresh', () => {
    const refreshTokenDto = {
      refreshToken: 'old-refresh-token',
    };

    const decodedPayload = {
      sub: userId,
      email: 'test@example.com',
      tenantId,
    };

    const activeSession = {
      id: 'session-id',
      userId,
      refreshToken: 'old-refresh-token',
      ipAddress: null,
      userAgent: null,
      deviceName: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'ACTIVE' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should rotate tokens successfully', async () => {
      tokenService.verifyRefreshToken.mockReturnValue(decodedPayload);
      sessionRepository.findByRefreshToken.mockResolvedValue(activeSession);
      tokenService.generateAccessToken.mockReturnValue('new-access-token');
      tokenService.generateRefreshToken.mockReturnValue('new-refresh-token');
      sessionRepository.revokeSession.mockResolvedValue(undefined);
      sessionRepository.createSession.mockResolvedValue(undefined);

      const result = await authService.refresh(refreshTokenDto);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.expiresIn).toBe(900);
      expect(sessionRepository.revokeSession).toHaveBeenCalledWith('session-id');
      expect(sessionRepository.createSession).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when session is not found', async () => {
      tokenService.verifyRefreshToken.mockReturnValue(decodedPayload);
      sessionRepository.findByRefreshToken.mockResolvedValue(null);

      await expect(authService.refresh(refreshTokenDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when session is revoked', async () => {
      tokenService.verifyRefreshToken.mockReturnValue(decodedPayload);
      sessionRepository.findByRefreshToken.mockResolvedValue({
        ...activeSession,
        status: 'REVOKED',
      });

      await expect(authService.refresh(refreshTokenDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when session is expired', async () => {
      tokenService.verifyRefreshToken.mockReturnValue(decodedPayload);
      sessionRepository.findByRefreshToken.mockResolvedValue({
        ...activeSession,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(authService.refresh(refreshTokenDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when refresh token is invalid', async () => {
      tokenService.verifyRefreshToken.mockImplementation(() => {
        throw new UnauthorizedException('Invalid or expired refresh token');
      });

      await expect(authService.refresh(refreshTokenDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── Logout ──────────────────────────────────────────────────────────

  describe('logout', () => {
    const refreshTokenDto = {
      refreshToken: 'some-refresh-token',
    };

    it('should logout successfully and revoke session', async () => {
      tokenService.verifyRefreshToken.mockReturnValue({ sub: userId });
      sessionRepository.findByRefreshToken.mockResolvedValue({
        id: 'session-id',
      });
      sessionRepository.revokeSession.mockResolvedValue(undefined);

      const result = await authService.logout(refreshTokenDto);

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(sessionRepository.revokeSession).toHaveBeenCalledWith('session-id');
    });

    it('should return success idempotently when session does not exist', async () => {
      tokenService.verifyRefreshToken.mockReturnValue({ sub: userId });
      sessionRepository.findByRefreshToken.mockResolvedValue(null);

      const result = await authService.logout(refreshTokenDto);

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(sessionRepository.revokeSession).not.toHaveBeenCalled();
    });

    it('should return success idempotently when token is already invalid', async () => {
      tokenService.verifyRefreshToken.mockImplementation(() => {
        throw new UnauthorizedException('Invalid or expired refresh token');
      });

      const result = await authService.logout(refreshTokenDto);

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(sessionRepository.findByRefreshToken).not.toHaveBeenCalled();
      expect(sessionRepository.revokeSession).not.toHaveBeenCalled();
    });
  });

  // ─── Logout All Devices ──────────────────────────────────────────────

  describe('logoutAllDevices', () => {
    it('should revoke all sessions and return count', async () => {
      sessionRepository.revokeAllUserSessions.mockResolvedValue({
        count: 3,
      });

      const result = await authService.logoutAllDevices(userId);

      expect(result).toEqual({ revokedCount: 3 });
      expect(sessionRepository.revokeAllUserSessions).toHaveBeenCalledWith(userId);
    });
  });
});
