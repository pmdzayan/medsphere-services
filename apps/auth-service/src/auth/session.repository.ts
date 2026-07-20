import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenIdentity, AuthenticatedIdentity, RequestMetadata } from './auth.types';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

export type RotationResult =
  | {
      readonly status: 'ROTATED';
      readonly identity: AccessTokenIdentity;
      readonly expiresAt: Date;
      readonly absoluteExpiresAt: Date;
    }
  | { readonly status: 'REPLAY_DETECTED' }
  | { readonly status: 'REJECTED' };

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function secureHashEquals(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(data: {
    id: string;
    membershipId: string;
    familyId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    absoluteExpiresAt: Date;
    metadata: RequestMetadata;
  }): Promise<void> {
    await this.prisma.client.userSession.create({
      data: {
        id: data.id,
        membershipId: data.membershipId,
        familyId: data.familyId,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        absoluteExpiresAt: data.absoluteExpiresAt,
        ipAddress: data.metadata.ipAddress,
        userAgent: data.metadata.userAgent,
        deviceName: data.metadata.deviceName,
      },
    });
  }

  async validateAccessIdentity(
    identity: AccessTokenIdentity,
    tokenId: string,
  ): Promise<AuthenticatedIdentity | null> {
    const now = new Date();
    const session = await this.prisma.client.userSession.findFirst({
      where: {
        id: identity.sessionId,
        membershipId: identity.membershipId,
        status: 'ACTIVE',
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
        membership: {
          id: identity.membershipId,
          tenantId: identity.tenantId,
          userId: identity.userId,
          status: 'ACTIVE',
          deletedAt: null,
          user: {
            id: identity.userId,
            status: 'ACTIVE',
            deletedAt: null,
          },
          tenant: {
            id: identity.tenantId,
            isActive: true,
            deletedAt: null,
          },
        },
      },
      select: { id: true },
    });

    if (!session) {
      return null;
    }

    return { ...identity, tokenId };
  }

  async rotateSession(data: {
    currentSessionId: string;
    presentedHash: string;
    nextSessionId: string;
    nextRefreshTokenHash: string;
    idleTtlSeconds: number;
    metadata: RequestMetadata;
  }): Promise<RotationResult> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.client.$transaction(
          async (transaction) => {
            const now = new Date();
            const current = await transaction.userSession.findUnique({
              where: { id: data.currentSessionId },
              include: {
                membership: {
                  include: {
                    user: true,
                    tenant: true,
                  },
                },
              },
            });

            if (!current || !secureHashEquals(current.refreshTokenHash, data.presentedHash)) {
              return { status: 'REJECTED' } as const;
            }

            if (current.status === 'ROTATED') {
              await transaction.userSession.updateMany({
                where: {
                  familyId: current.familyId,
                  status: { in: ['ACTIVE', 'ROTATED'] },
                },
                data: {
                  status: 'COMPROMISED',
                  revokedAt: now,
                  revocationReason: 'refresh-credential-replay',
                },
              });
              return { status: 'REPLAY_DETECTED' } as const;
            }

            if (current.status !== 'ACTIVE') {
              return { status: 'REJECTED' } as const;
            }

            if (current.expiresAt <= now || current.absoluteExpiresAt <= now) {
              await transaction.userSession.update({
                where: { id: current.id },
                data: {
                  status: 'EXPIRED',
                  revokedAt: now,
                  revocationReason: 'session-expired',
                },
              });
              return { status: 'REJECTED' } as const;
            }

            const membership = current.membership;
            if (
              membership.status !== 'ACTIVE' ||
              membership.deletedAt ||
              membership.user.status !== 'ACTIVE' ||
              membership.user.deletedAt ||
              !membership.tenant.isActive ||
              membership.tenant.deletedAt
            ) {
              await transaction.userSession.updateMany({
                where: { familyId: current.familyId, status: 'ACTIVE' },
                data: {
                  status: 'REVOKED',
                  revokedAt: now,
                  revocationReason: 'identity-chain-inactive',
                },
              });
              return { status: 'REJECTED' } as const;
            }

            const claimed = await transaction.userSession.updateMany({
              where: {
                id: current.id,
                status: 'ACTIVE',
                replacedById: null,
              },
              data: {
                status: 'ROTATED',
                lastUsedAt: now,
              },
            });

            if (claimed.count !== 1) {
              return { status: 'REJECTED' } as const;
            }

            const idleExpiry = new Date(now.getTime() + data.idleTtlSeconds * 1000);
            const expiresAt = new Date(
              Math.min(idleExpiry.getTime(), current.absoluteExpiresAt.getTime()),
            );

            await transaction.userSession.create({
              data: {
                id: data.nextSessionId,
                membershipId: current.membershipId,
                familyId: current.familyId,
                refreshTokenHash: data.nextRefreshTokenHash,
                expiresAt,
                absoluteExpiresAt: current.absoluteExpiresAt,
                ipAddress: data.metadata.ipAddress,
                userAgent: data.metadata.userAgent,
                deviceName: data.metadata.deviceName,
              },
            });

            await transaction.userSession.update({
              where: { id: current.id },
              data: { replacedById: data.nextSessionId },
            });

            return {
              status: 'ROTATED',
              identity: {
                userId: membership.userId,
                membershipId: membership.id,
                tenantId: membership.tenantId,
                sessionId: data.nextSessionId,
              },
              expiresAt,
              absoluteExpiresAt: current.absoluteExpiresAt,
            } as const;
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        if (!hasPrismaCode(error, 'P2034') || attempt === MAX_SERIALIZABLE_ATTEMPTS) {
          throw error;
        }
      }
    }

    throw new Error('Session rotation retry invariant violated');
  }

  async revokeCurrentFamily(sessionId: string, userId: string): Promise<number> {
    const session = await this.prisma.client.userSession.findFirst({
      where: {
        id: sessionId,
        membership: { userId },
      },
      select: { familyId: true },
    });

    if (!session) {
      return 0;
    }

    const now = new Date();
    const result = await this.prisma.client.userSession.updateMany({
      where: { familyId: session.familyId, status: 'ACTIVE' },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revocationReason: 'user-logout',
      },
    });
    return result.count;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const now = new Date();
    const result = await this.prisma.client.userSession.updateMany({
      where: {
        status: 'ACTIVE',
        membership: { userId },
      },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revocationReason: 'user-logout-all',
      },
    });
    return result.count;
  }

  async expireStaleSessions(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.client.userSession.updateMany({
      where: {
        status: 'ACTIVE',
        OR: [{ expiresAt: { lte: now } }, { absoluteExpiresAt: { lte: now } }],
      },
      data: {
        status: 'EXPIRED',
        revokedAt: now,
        revocationReason: 'session-expired',
      },
    });
    return result.count;
  }
}
