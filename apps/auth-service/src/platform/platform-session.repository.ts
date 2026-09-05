import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditWriter } from '../audit/audit-writer.service';
import { withSerializableRetry } from '../prisma/transaction.util';
import { RequestMetadata } from '../auth/auth.types';
import {
  PlatformAccessTokenIdentity,
  PlatformAuthenticatedIdentity,
  PlatformRotationResult,
} from './platform.types';
import { decidePlatformRotation, PlatformCredentialState } from './platform-session-policy';
import { PlatformTokenService } from './platform-token.service';

@Injectable()
export class PlatformSessionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditWriter: AuditWriter,
    private readonly platformTokens: PlatformTokenService,
  ) {}

  /**
   * Creates a dedicated platform session for an authenticated, authorized
   * platform actor. Never fabricates a tenant session: the platform session
   * is tenant/membership-free by construction.
   */
  async createPlatformSession(data: {
    id: string;
    userId: string;
    familyId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    absoluteExpiresAt: Date;
    metadata: RequestMetadata;
  }): Promise<void> {
    await withSerializableRetry(this.prisma.client, async (transaction) => {
      await transaction.platformSession.create({
        data: {
          id: data.id,
          userId: data.userId,
          familyId: data.familyId,
          refreshTokenHash: data.refreshTokenHash,
          expiresAt: data.expiresAt,
          absoluteExpiresAt: data.absoluteExpiresAt,
          version: 1,
          securityVersion: 1,
          recentAuthenticatedAt: new Date(),
          ipAddress: data.metadata.ipAddress,
          userAgent: data.metadata.userAgent,
          deviceName: data.metadata.deviceName,
        },
      });

      await transaction.platformSessionRefreshCredential.create({
        data: {
          platformSessionId: data.id,
          hash: data.refreshTokenHash,
          status: 'ACTIVE',
          rotationSequence: 1,
        },
      });

      await this.auditWriter.appendPlatformUser(transaction, {
        platformActorUserId: data.userId,
        eventType: 'platform.authentication.session.created',
        outcome: 'SUCCEEDED',
        resourceType: 'platform-session',
        resourceId: data.id,
        request: data.metadata,
      });
    });
  }

  /**
   * Live, fail-closed platform access validation. Requires an ACTIVE platform
   * session, ACTIVE platform account, ACTIVE global user, and at least one
   * live platform role assignment; suspended accounts and revoked role
   * assignments fail immediately through this live lookup.
   */
  async validatePlatformAccessIdentity(
    identity: PlatformAccessTokenIdentity,
    tokenId: string,
  ): Promise<PlatformAuthenticatedIdentity | null> {
    const now = new Date();
    const session = await this.prisma.client.platformSession.findFirst({
      where: {
        id: identity.platformSessionId,
        userId: identity.userId,
        status: 'ACTIVE',
        lockedAt: null,
        securityVersion: identity.securityVersion,
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
        platformAccount: {
          id: identity.platformAccountId,
          status: 'ACTIVE',
          deletedAt: null,
          roleAssignments: { some: {} },
        },
        user: {
          id: identity.userId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      },
      select: { id: true },
    });

    if (!session) {
      return null;
    }
    return { ...identity, tokenId };
  }
  async rotatePlatformSession(data: {
    currentPlatformSessionId: string;
    presentedHash: string;
    nextPlatformSessionId: string;
    nextRefreshTokenHash: string;
    idleTtlSeconds: number;
    metadata: RequestMetadata;
  }): Promise<PlatformRotationResult> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const now = new Date();

      const session = await transaction.platformSession.findUnique({
        where: { id: data.currentPlatformSessionId },
        include: {
          platformAccount: {
            include: { user: true },
          },
        },
      });

      if (!session) {
        await this.writePlatformRefreshFailure(
          transaction,
          data.currentPlatformSessionId,
          'session-not-found',
          data.metadata,
        );
        return { status: 'INVALID' } as const;
      }

      const credential = await transaction.platformSessionRefreshCredential.findFirst({
        where: { platformSessionId: session.id, hash: data.presentedHash },
        select: {
          id: true,
          hash: true,
          status: true,
          usedAt: true,
          revokedAt: true,
          rotationSequence: true,
        },
      });

      let credentialState: PlatformCredentialState = 'UNKNOWN';
      if (credential?.status === 'ACTIVE') {
        credentialState = 'ACTIVE';
      } else if (credential?.status === 'USED') {
        credentialState = 'USED';
      } else if (credential?.status === 'REVOKED') {
        credentialState = 'REVOKED';
      }

      const account = session.platformAccount;
      if (!account) {
        await this.writePlatformRefreshFailure(
          transaction,
          session.id,
          'platform-account-missing',
          data.metadata,
        );
        return { status: 'PLATFORM_ACCESS_DISABLED' } as const;
      }

      const hasActivePlatformRoleAssignment =
        (await transaction.platformRoleAssignment.count({
          where: {
            platformAccountId: account.id,
            platformAccount: { status: 'ACTIVE', deletedAt: null },
          },
        })) > 0;

      const decision = decidePlatformRotation({
        sessionStatus: session.status,
        sessionRevokedAt: session.revokedAt,
        sessionLockedAt: session.lockedAt,
        expiresAt: session.expiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
        credentialState,
        credentialRevokedAt: credential?.revokedAt ?? null,
        platformAccountStatus: account.status,
        platformAccountDeletedAt: account.deletedAt,
        hasActivePlatformRoleAssignment,
        userStatus: account.user.status,
        userDeletedAt: account.user.deletedAt,
        now,
      });

      switch (decision.outcome) {
        case 'REPLAY_DETECTED': {
          const revokedCount = await this.revokePlatformFamily(
            transaction,
            session.familyId,
            now,
            'platform-refresh-credential-replay',
            'COMPROMISED',
          );
          await this.auditWriter.appendPlatformUser(transaction, {
            platformActorUserId: session.userId,
            eventType: 'platform.authentication.session.refresh.replayed',
            outcome: 'DENIED',
            resourceType: 'platform-session-family',
            resourceId: session.familyId,
            metadata: { revokedCount },
            request: data.metadata,
          });
          return { status: 'REPLAY_DETECTED' } as const;
        }

        case 'REVOKED': {
          await this.writePlatformRefreshFailure(
            transaction,
            session.id,
            'platform-session-revoked',
            data.metadata,
          );
          return { status: 'REVOKED' } as const;
        }
        case 'EXPIRED': {
          await transaction.platformSession.updateMany({
            where: { id: session.id, status: 'ACTIVE' },
            data: {
              status: 'EXPIRED',
              revokedAt: now,
              revocationReason: 'platform-session-expired',
            },
          });
          await transaction.platformSessionRefreshCredential.updateMany({
            where: { platformSessionId: session.id, status: 'ACTIVE' },
            data: { status: 'REVOKED', revokedAt: now },
          });
          await this.writePlatformRefreshFailure(
            transaction,
            session.id,
            'platform-session-expired',
            data.metadata,
          );
          return { status: 'EXPIRED' } as const;
        }

        case 'IDENTITY_DISABLED':
        case 'PLATFORM_ACCESS_DISABLED': {
          await this.revokePlatformFamily(
            transaction,
            session.familyId,
            now,
            'platform-access-chain-inactive',
            'REVOKED',
          );
          await this.writePlatformRefreshFailure(
            transaction,
            session.id,
            'platform-access-chain-inactive',
            data.metadata,
          );
          return { status: decision.outcome } as const;
        }

        case 'LOCKED': {
          await this.writePlatformRefreshFailure(
            transaction,
            session.id,
            'platform-session-locked',
            data.metadata,
          );
          return { status: 'LOCKED' } as const;
        }

        case 'INVALID': {
          await this.writePlatformRefreshFailure(
            transaction,
            session.id,
            'invalid-verifier',
            data.metadata,
          );
          return { status: 'INVALID' } as const;
        }

        case 'ROTATED': {
          return this.performPlatformRotation(transaction, {
            session,
            credential,
            platformAccountId: account.id,
            nextPlatformSessionId: data.nextPlatformSessionId,
            nextRefreshTokenHash: data.nextRefreshTokenHash,
            idleTtlSeconds: data.idleTtlSeconds,
            metadata: data.metadata,
            now,
          });
        }
      }
    });
  }

  async revokeCurrentPlatformFamily(
    identity: PlatformAuthenticatedIdentity,
    metadata: RequestMetadata = {},
  ): Promise<number> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const session = await transaction.platformSession.findFirst({
        where: { id: identity.platformSessionId, userId: identity.userId },
        select: { familyId: true },
      });

      const now = new Date();
      const revokedCount = session
        ? await this.revokePlatformFamily(
            transaction,
            session.familyId,
            now,
            'platform-user-logout',
            'REVOKED',
          )
        : 0;

      await this.auditWriter.appendPlatformUser(transaction, {
        platformActorUserId: identity.userId,
        eventType: 'platform.authentication.session.logout.succeeded',
        outcome: 'SUCCEEDED',
        resourceType: 'platform-session',
        resourceId: identity.platformSessionId,
        metadata: { revokedCount },
        request: metadata,
      });

      return revokedCount;
    });
  }
  private async performPlatformRotation(
    transaction: Prisma.TransactionClient,
    parameters: {
      session: Awaited<ReturnType<Prisma.TransactionClient['platformSession']['findUnique']>>;
      credential: {
        id: string;
        hash: string;
        status: string;
        rotationSequence: number;
      } | null;
      platformAccountId: string;
      nextPlatformSessionId: string;
      nextRefreshTokenHash: string;
      idleTtlSeconds: number;
      metadata: RequestMetadata;
      now: Date;
    },
  ): Promise<PlatformRotationResult> {
    const {
      session,
      credential,
      platformAccountId,
      nextPlatformSessionId,
      nextRefreshTokenHash,
      idleTtlSeconds,
      metadata,
      now,
    } = parameters;

    if (!session || !credential || credential.status !== 'ACTIVE') {
      throw new Error('Platform session rotation invariant violated: active credential missing');
    }

    const claimed = await transaction.platformSession.updateMany({
      where: {
        id: session.id,
        status: 'ACTIVE',
        version: session.version,
        replacedById: null,
      },
      data: {
        status: 'ROTATED',
        lastUsedAt: now,
        version: session.version + 1,
      },
    });

    if (claimed.count !== 1) {
      await this.writePlatformRefreshFailure(
        transaction,
        session.id,
        'platform-session-state-conflict',
        metadata,
      );
      return { status: 'INVALID' } as const;
    }

    const nextCredentialId = randomUUID();
    const idleExpiry = new Date(now.getTime() + idleTtlSeconds * 1000);
    const expiresAt = new Date(Math.min(idleExpiry.getTime(), session.absoluteExpiresAt.getTime()));

    await transaction.platformSession.create({
      data: {
        id: nextPlatformSessionId,
        userId: session.userId,
        familyId: session.familyId,
        refreshTokenHash: nextRefreshTokenHash,
        expiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
        version: 1,
        securityVersion: session.securityVersion,
        recentAuthenticatedAt: session.recentAuthenticatedAt,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceName: metadata.deviceName,
      },
    });
    await transaction.platformSessionRefreshCredential.create({
      data: {
        id: nextCredentialId,
        platformSessionId: nextPlatformSessionId,
        hash: nextRefreshTokenHash,
        status: 'ACTIVE',
        rotationSequence: credential.rotationSequence + 1,
      },
    });

    const used = await transaction.platformSessionRefreshCredential.updateMany({
      where: { id: credential.id, status: 'ACTIVE' },
      data: { status: 'USED', usedAt: now, replacedById: nextCredentialId },
    });
    if (used.count !== 1) {
      throw new Error('Platform session rotation invariant violated: credential claim failed');
    }

    await transaction.platformSession.update({
      where: { id: session.id },
      data: { replacedById: nextPlatformSessionId },
    });

    await this.auditWriter.appendPlatformUser(transaction, {
      platformActorUserId: session.userId,
      eventType: 'platform.authentication.session.refresh.succeeded',
      outcome: 'SUCCEEDED',
      resourceType: 'platform-session',
      resourceId: nextPlatformSessionId,
      metadata: { previousPlatformSessionId: session.id },
      request: metadata,
    });

    return {
      status: 'ROTATED',
      identity: {
        userId: session.userId,
        platformAccountId,
        platformSessionId: nextPlatformSessionId,
        securityVersion: session.securityVersion,
      },
      expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    } as const;
  }

  /**
   * Revokes an entire platform-session family (active + rotated rows), used
   * by logout, replay/compromise escalation, and account revocation.
   */
  private async revokePlatformFamily(
    transaction: Prisma.TransactionClient,
    familyId: string,
    now: Date,
    reason: string,
    status: 'COMPROMISED' | 'REVOKED',
  ): Promise<number> {
    const affected = await transaction.platformSession.findMany({
      where: { familyId, status: { in: ['ACTIVE', 'ROTATED'] } },
      select: { id: true },
    });

    if (affected.length > 0) {
      await transaction.platformSessionRefreshCredential.updateMany({
        where: {
          platformSessionId: { in: affected.map((value) => value.id) },
          status: 'ACTIVE',
        },
        data: { status: 'REVOKED', revokedAt: now },
      });
    }

    const revoked = await transaction.platformSession.updateMany({
      where: { familyId, status: { in: ['ACTIVE', 'ROTATED'] } },
      data: { status, revokedAt: now, revocationReason: reason },
    });
    return revoked.count;
  }

  private async writePlatformRefreshFailure(
    transaction: Prisma.TransactionClient,
    platformSessionId: string,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    await this.auditWriter.appendSystem(transaction, {
      eventType: 'platform.authentication.session.refresh.failed',
      outcome: 'DENIED',
      resourceType: 'platform-session',
      resourceId: platformSessionId,
      metadata: { reason },
      request: metadata,
    });
  }

  /**
   * Revokes ALL active platform sessions for one global user/platform
   * account. Used by admin suspension (immediate revocation) and by the
   * explicit "revoke platform sessions" admin action.
   */
  async revokeAllPlatformSessionsForUserId(
    userId: string,
    reason: string = 'platform-access-revoked',
  ): Promise<number> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const now = new Date();
      const active = await transaction.platformSession.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { id: true },
      });

      if (active.length > 0) {
        await transaction.platformSessionRefreshCredential.updateMany({
          where: {
            platformSessionId: { in: active.map((value) => value.id) },
            status: 'ACTIVE',
          },
          data: { status: 'REVOKED', revokedAt: now },
        });
      }

      const revoked = await transaction.platformSession.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now, revocationReason: reason },
      });
      return revoked.count;
    });
  }
}
