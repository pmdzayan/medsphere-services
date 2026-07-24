import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenIdentity, AuthenticatedIdentity, RequestMetadata } from './auth.types';
import { AuditWriter } from '../audit/audit-writer.service';
import { withSerializableRetry } from '../prisma/transaction.util';

export type RotationResult =
  | {
      readonly status: 'ROTATED';
      readonly identity: AccessTokenIdentity;
      readonly expiresAt: Date;
      readonly absoluteExpiresAt: Date;
    }
  | { readonly status: 'REPLAY_DETECTED' }
  | { readonly status: 'REJECTED' };

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditWriter: AuditWriter,
  ) {}

  async createSession(data: {
    id: string;
    membershipId: string;
    tenantId: string;
    familyId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    absoluteExpiresAt: Date;
    metadata: RequestMetadata;
  }): Promise<void> {
    await withSerializableRetry(this.prisma.client, async (transaction) => {
      await transaction.userSession.create({
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
      await this.auditWriter.appendTenantUser(transaction, {
        tenantId: data.tenantId,
        actorMembershipId: data.membershipId,
        eventType: 'authentication.session.created',
        outcome: 'SUCCEEDED',
        resourceType: 'authentication-session',
        resourceId: data.id,
        request: data.metadata,
      });
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
    return withSerializableRetry(this.prisma.client, async (transaction) => {
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

      if (!current) {
        await this.auditWriter.appendSystem(transaction, {
          eventType: 'authentication.session.refresh.failed',
          outcome: 'DENIED',
          resourceType: 'authentication-session',
          resourceId: data.currentSessionId,
          metadata: { reason: 'session-not-found' },
          request: data.metadata,
        });
        return { status: 'REJECTED' } as const;
      }

      const tenantActor = {
        tenantId: current.membership.tenantId,
        actorMembershipId: current.membershipId,
      };

      if (!secureHashEquals(current.refreshTokenHash, data.presentedHash)) {
        await this.auditWriter.appendTenantUser(transaction, {
          ...tenantActor,
          eventType: 'authentication.session.refresh.failed',
          outcome: 'DENIED',
          resourceType: 'authentication-session',
          resourceId: current.id,
          metadata: { reason: 'invalid-verifier' },
          request: data.metadata,
        });
        return { status: 'REJECTED' } as const;
      }

      if (current.status === 'ROTATED') {
        const compromised = await transaction.userSession.updateMany({
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
        await this.auditWriter.appendTenantUser(transaction, {
          ...tenantActor,
          eventType: 'authentication.session.refresh.replayed',
          outcome: 'DENIED',
          resourceType: 'authentication-session-family',
          resourceId: current.familyId,
          metadata: { revokedCount: compromised.count },
          request: data.metadata,
        });
        return { status: 'REPLAY_DETECTED' } as const;
      }

      if (current.status !== 'ACTIVE') {
        await this.auditWriter.appendTenantUser(transaction, {
          ...tenantActor,
          eventType: 'authentication.session.refresh.failed',
          outcome: 'DENIED',
          resourceType: 'authentication-session',
          resourceId: current.id,
          metadata: { reason: 'session-inactive' },
          request: data.metadata,
        });
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
        await this.auditWriter.appendTenantUser(transaction, {
          ...tenantActor,
          eventType: 'authentication.session.refresh.failed',
          outcome: 'DENIED',
          resourceType: 'authentication-session',
          resourceId: current.id,
          metadata: { reason: 'session-expired' },
          request: data.metadata,
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
        await this.auditWriter.appendTenantUser(transaction, {
          ...tenantActor,
          eventType: 'authentication.session.refresh.failed',
          outcome: 'DENIED',
          resourceType: 'authentication-session',
          resourceId: current.id,
          metadata: { reason: 'identity-chain-inactive' },
          request: data.metadata,
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
        await this.auditWriter.appendTenantUser(transaction, {
          ...tenantActor,
          eventType: 'authentication.session.refresh.failed',
          outcome: 'DENIED',
          resourceType: 'authentication-session',
          resourceId: current.id,
          metadata: { reason: 'session-state-conflict' },
          request: data.metadata,
        });
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

      await this.auditWriter.appendTenantUser(transaction, {
        ...tenantActor,
        eventType: 'authentication.session.refresh.succeeded',
        outcome: 'SUCCEEDED',
        resourceType: 'authentication-session',
        resourceId: data.nextSessionId,
        metadata: { previousSessionId: current.id },
        request: data.metadata,
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
    });
  }

  async revokeCurrentFamily(
    identity: AuthenticatedIdentity,
    metadata: RequestMetadata = {},
  ): Promise<number> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const session = await transaction.userSession.findFirst({
        where: {
          id: identity.sessionId,
          membershipId: identity.membershipId,
          membership: {
            userId: identity.userId,
            tenantId: identity.tenantId,
          },
        },
        select: { familyId: true },
      });
      const now = new Date();
      const result = session
        ? await transaction.userSession.updateMany({
            where: { familyId: session.familyId, status: 'ACTIVE' },
            data: {
              status: 'REVOKED',
              revokedAt: now,
              revocationReason: 'user-logout',
            },
          })
        : { count: 0 };
      await this.auditWriter.appendTenantUser(transaction, {
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        eventType: 'authentication.session.logout.succeeded',
        outcome: 'SUCCEEDED',
        resourceType: 'authentication-session',
        resourceId: identity.sessionId,
        metadata: { revokedCount: result.count },
        request: metadata,
      });
      return result.count;
    });
  }

  async revokeAllForUser(
    identity: AuthenticatedIdentity,
    metadata: RequestMetadata = {},
  ): Promise<number> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const now = new Date();
      const result = await transaction.userSession.updateMany({
        where: {
          status: 'ACTIVE',
          membership: { userId: identity.userId },
        },
        data: {
          status: 'REVOKED',
          revokedAt: now,
          revocationReason: 'user-logout-all',
        },
      });
      await this.auditWriter.appendPlatformUser(transaction, {
        platformActorUserId: identity.userId,
        eventType: 'authentication.sessions.logout.succeeded',
        outcome: 'SUCCEEDED',
        resourceType: 'global-user-sessions',
        resourceId: identity.userId,
        metadata: { revokedCount: result.count },
        request: metadata,
      });
      return result.count;
    });
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
