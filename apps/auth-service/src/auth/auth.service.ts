import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';

import { UsersRepository } from '../users/users.repository';
import { PasswordService } from './password.service';
import { RegistrationService } from './registration.service';
import { TokenService } from './token.service';
import { SessionRepository } from './session.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly registrationService: RegistrationService,
    private readonly tokenService: TokenService,
    private readonly sessionRepository: SessionRepository,
  ) {}

  async register(registerDto: RegisterDto) {
    return this.registrationService.register(registerDto);
  }

  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.usersRepository.findByEmail(loginDto.tenantId, loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    const isValidPassword = await this.passwordService.verify(user.passwordHash, loginDto.password);

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokenPayload = { sub: user.id, email: user.email, tenantId: user.tenantId };

    const accessToken = this.tokenService.generateAccessToken(tokenPayload);
    const refreshToken = this.tokenService.generateRefreshToken(tokenPayload);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.sessionRepository.createSession({
      userId: user.id,
      refreshToken,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  async logout(refreshTokenDto: RefreshTokenDto): Promise<{ message: string }> {
    try {
      this.tokenService.verifyRefreshToken(refreshTokenDto.refreshToken);
    } catch {
      return { message: 'Logged out successfully' };
    }

    const existingSession = await this.sessionRepository.findByRefreshToken(
      refreshTokenDto.refreshToken,
    );

    if (!existingSession) {
      return { message: 'Logged out successfully' };
    }

    await this.sessionRepository.revokeSession(existingSession.id);

    return { message: 'Logged out successfully' };
  }

  async logoutAllDevices(userId: string): Promise<{ revokedCount: number }> {
    const result = await this.sessionRepository.revokeAllUserSessions(userId);

    return { revokedCount: result.count };
  }

  async refresh(refreshTokenDto: RefreshTokenDto) {
    const decoded = this.tokenService.verifyRefreshToken(refreshTokenDto.refreshToken);

    const existingSession = await this.sessionRepository.findByRefreshToken(
      refreshTokenDto.refreshToken,
    );

    if (!existingSession) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existingSession.status !== 'ACTIVE') {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (existingSession.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const tokenPayload = {
      sub: existingSession.userId,
      email: decoded.email,
      tenantId: decoded.tenantId,
    };

    const newAccessToken = this.tokenService.generateAccessToken(tokenPayload);
    const newRefreshToken = this.tokenService.generateRefreshToken(tokenPayload);

    await this.sessionRepository.revokeSession(existingSession.id);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.sessionRepository.createSession({
      userId: existingSession.userId,
      refreshToken: newRefreshToken,
      expiresAt,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    };
  }
}
