import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionRepository {
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

  async findById(id: string) {
    return this.prisma.client.userSession.findUnique({
      where: { id },
    });
  }

  async findByRefreshToken(refreshToken: string) {
    return this.prisma.client.userSession.findUnique({
      where: { refreshToken },
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
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
      },
    });
  }

  async deleteExpiredSessions() {
    return this.prisma.client.userSession.deleteMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });
  }
}
