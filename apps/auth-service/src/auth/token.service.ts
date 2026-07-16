import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class TokenService {
  private readonly accessTokenExpiration: string;
  private readonly refreshTokenExpiration: string;

  constructor(private readonly jwtService: JwtService) {
    this.accessTokenExpiration = process.env.JWT_ACCESS_EXPIRATION || '15m';
    this.refreshTokenExpiration = process.env.JWT_REFRESH_EXPIRATION || '7d';
  }

  generateAccessToken(payload: Record<string, unknown>): string {
    return this.jwtService.sign(payload, {
      expiresIn: this.accessTokenExpiration,
    });
  }

  generateRefreshToken(payload: Record<string, unknown>): string {
    return this.jwtService.sign(payload, {
      expiresIn: this.refreshTokenExpiration,
    });
  }

  verifyAccessToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  verifyRefreshToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  decode(token: string) {
    return this.jwtService.decode(token);
  }
}
