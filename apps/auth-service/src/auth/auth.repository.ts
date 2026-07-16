import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(data: {
    userId: string;
    refreshToken: string;
    ipAddress?: string;
    userAgent?: string;
    deviceName?: string;
    expiresAt: Date;
  }) {
    return this.prisma.client.userSession.create({
      data,
    });
  }

  async findSessionByRefreshToken(refreshToken: string) {
    return this.prisma.client.userSession.findUnique({
      where: {
        refreshToken,
      },
    });
  }

  async revokeSession(id: string) {
    return this.prisma.client.userSession.update({
      where: { id },
      data: {
        status: 'REVOKED',
      },
    });
  }

  async revokeAllUserSessions(userId: string) {
    return this.prisma.client.userSession.updateMany({
      where: {
        userId,
      },
      data: {
        status: 'REVOKED',
      },
    });
  }
}
