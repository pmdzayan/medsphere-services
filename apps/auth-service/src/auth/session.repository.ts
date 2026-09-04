import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenIdentity, AuthenticatedIdentity, RequestMetadata } from './auth.types';
import { AuditWriter } from '../audit/audit-writer.service';
import { withSerializableRetry } from '../prisma/transaction.util';
import { decideRotation, PresentedCredentialState } from './session-policy';

export type RotationResult =
  | {
      readonly status: 'ROTATED';
      readonly identity: AccessTokenIdentity;
      readonly expiresAt: Date;
      readonly absoluteExpiresAt: Date;
    }
  | { readonly status: 'REPLAY_DETECTED' }
  | { readonly status: 'INVALID' }
  | { readonly status: 'EXPIRED' }
  | { readonly status: 'REVOKED' }
  | { readonly status: 'IDENTITY_DISABLED' }
  | { readonly status: 'LOCKED' };

const DEFAULT_CLEANUP_BATCH_SIZE = 1000;
const MAXIMUM_CLEANUP_BATCH_SIZE = 10_000;

@Injectable()
export class SessionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditWriter: AuditWriter,
  ) {}

  async createSession(data: {
    id: string;
    userId: string;
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
          userId: data.userId,
          membershipId: data.membershipId,
          tenantId: data.tenantId,
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

      await transaction.userSessionRefreshCredential.create({
        data: {
          sessionId: data.id,
          hash: data.refreshTokenHash,
          status: 'ACTIVE',
          rotationSequence: 1,
        },
      });

      await this.auditWriter.appendTenantUser(transaction, {
        tenantId: data.tenantId,
        actorMembershipId: data.membershipId,
        actorUserId: data.userId,
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
        userId: identity.userId,
        membershipId: identity.membershipId,
        tenantId: identity.tenantId,
        status: 'ACTIVE',
        // Task 0014: a locked session must fail closed for every
        // protected action -- the lock screen is not just UI.
        lockedAt: null,
        // Task 0014: an access token issued before the lock carries an
        // older securityVersion and must be rejected.
        securityVersion: identity.securityVersion,
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
      select: {
        id: true,
        lockedAt: true,
        lockReason: true,
        securityVersion: true,
      },
    });

    if (!session) {
      return null;
    }

    return { ...identity, tokenId };
  }

  /**
   * Task 0014: locks the current workstation session. The session itself
   * remains ACTIVE so a re-authentication can unlock the SAME identity, but
   * it is marked locked and its securityVersion is incremented so every
   * access token issued before the lock is instantly invalid (fail-closed).
   */
  async lockSession(
    identity: AuthenticatedIdentity,
    reason: string,
    metadata: RequestMetadata = {},
  ): Promise<{ securityVersion: number }> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const now = new Date();
      const updated = await transaction.userSession.updateMany({
        where: {
          id: identity.sessionId,
          userId: identity.userId,
          membershipId: identity.membershipId,
          tenantId: identity.tenantId,
          status: 'ACTIVE',
          lockedAt: null,
        },
        data: {
          lockedAt: now,
          lockReason: reason,
          unlockedAt: null,
          unlockMethod: null,
          securityVersion: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new Error('Session lock invariant violated');
      }

      const session = await transaction.userSession.findUniqueOrThrow({
        where: { id: identity.sessionId },
        select: { securityVersion: true },
      });

      await this.auditWriter.appendTenantUser(transaction, {
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        actorUserId: identity.userId,
        eventType: 'authentication.session.locked',
        outcome: 'SUCCEEDED',
        resourceType: 'authentication-session',
        resourceId: identity.sessionId,
        metadata: { reason },
        request: metadata,
      });

      return { securityVersion: session.securityVersion };
    });
  }

  /**
   * Task 0014: unlocks the workstation session. The caller must present the
   * SAME currently-locked session's refresh credential (opaque, single-use,
   * verified by HMAC) together with a successfully verified same-identity
   * credential proof. Unlock rotates the session, carrying forward the new
   * securityVersion so the fresh access token is the only valid one.
   */
  async unlockSession(data: {
    currentSessionId: string;
    presentedHash: string;
    nextSessionId: string;
    nextRefreshTokenHash: string;
    unlockMethod: string;
    idleTtlSeconds: number;
    metadata: RequestMetadata;
  }): Promise<RotationResult> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const now = new Date();
      const session = await transaction.userSession.findUnique({
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

      if (!session) {
        // No session or membership could be resolved for the presented credential
        // claim: there is NO authenticated human actor. We must never fabricate a
        // user identity from a session id or any other non-user identifier.
        // Record the evidence under SYSTEM/service audit semantics instead,
        // mirroring the unknown-session path used by rotateSession.
        await this.auditWriter.appendSystem(transaction, {
          eventType: 'authentication.session.refresh.failed',
          outcome: 'DENIED',
          resourceType: 'authentication-session',
          resourceId: data.currentSessionId,
          metadata: { reason: 'session-not-found' },
          request: data.metadata,
        });
        return { status: 'INVALID' } as const;
      }

      if (session.status !== 'ACTIVE' || session.lockedAt === null) {
        const actor = {
          tenantId: session.membership.tenantId,
          actorMembershipId: session.membershipId,
          actorUserId: session.membership.userId,
        };
        await this.writeRefreshFailure(
          transaction,
          actor,
          session.id,
          session.familyId,
          'session-not-locked',
          data.metadata,
        );
        return { status: 'INVALID' } as const;
      }

      const tenantActor = {
        tenantId: session.membership.tenantId,
        actorMembershipId: session.membershipId,
        actorUserId: session.membership.userId,
      };

      const credential = await transaction.userSessionRefreshCredential.findFirst({
        where: {
          sessionId: session.id,
          hash: data.presentedHash,
        },
        select: {
          id: true,
          hash: true,
          status: true,
          usedAt: true,
          revokedAt: true,
          rotationSequence: true,
        },
      });

      if (!credential || credential.status !== 'ACTIVE') {
        await this.auditWriter.appendTenantUser(transaction, {
          ...tenantActor,
          eventType: 'authentication.session.unlock.failed',
          outcome: 'DENIED',
          resourceType: 'authentication-session',
          resourceId: session.id,
          metadata: { reason: 'invalid-refresh-credential' },
          request: data.metadata,
        });
        return { status: 'INVALID' } as const;
      }

      return this.performUnlockRotation(transaction, {
        session,
        credential,
        nextSessionId: data.nextSessionId,
        nextRefreshTokenHash: data.nextRefreshTokenHash,
        unlockMethod: data.unlockMethod,
        idleTtlSeconds: data.idleTtlSeconds,
        metadata: data.metadata,
        tenantActor,
        now,
      });
    });
  }

  /**
   * Task 0014: verifies recent authentication for the exact active session.
   *
   * This is server-authoritative and fails closed for locked, expired,
   * revoked, rotated, stale-security-version, or missing recent-auth state.
   */
  async isRecentlyAuthenticated(
    identity: AuthenticatedIdentity,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
      return false;
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - ttlSeconds * 1000);

    const session = await this.prisma.client.userSession.findFirst({
      where: {
        id: identity.sessionId,
        userId: identity.userId,
        membershipId: identity.membershipId,
        tenantId: identity.tenantId,
        status: 'ACTIVE',
        lockedAt: null,
        securityVersion: identity.securityVersion,
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
        recentAuthenticatedAt: { gte: cutoff, lte: now },
      },
      select: { id: true },
    });

    return session !== null;
  }

  /**
   * Task 0014: advances recent authentication only after the service has
   * verified a fresh same-user password or linked Google credential.
   *
   * The update is bound to the exact currently-authenticated active,
   * unlocked, unexpired session and its securityVersion. A stale, locked,
   * revoked, rotated, or otherwise invalid session fails closed.
   */
  async reauthenticateSession(
    identity: AuthenticatedIdentity,
    method: string,
    metadata: RequestMetadata = {},
  ): Promise<{ recentAuthenticatedAt: Date } | null> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const now = new Date();

      const updated = await transaction.userSession.updateMany({
        where: {
          id: identity.sessionId,
          userId: identity.userId,
          membershipId: identity.membershipId,
          tenantId: identity.tenantId,
          status: 'ACTIVE',
          lockedAt: null,
          securityVersion: identity.securityVersion,
          expiresAt: { gt: now },
          absoluteExpiresAt: { gt: now },
        },
        data: {
          recentAuthenticatedAt: now,
        },
      });

      if (updated.count !== 1) {
        return null;
      }

      await this.auditWriter.appendTenantUser(transaction, {
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        actorUserId: identity.userId,
        eventType: 'authentication.session.reauthenticated',
        outcome: 'SUCCEEDED',
        resourceType: 'authentication-session',
        resourceId: identity.sessionId,
        metadata: { method },
        request: metadata,
      });

      return { recentAuthenticatedAt: now };
    });
  }

  /**
   * Task 0014: safely revokes the locked session family. Used by locked
   * logout and switch-user: the old session is terminated server-side so
   * a copied/stale credential cannot resume it.
   */
  async revokeLockedFamily(
    identity: AuthenticatedIdentity,
    metadata: RequestMetadata = {},
    eventType:
      | 'authentication.session.logout.locked'
      | 'authentication.session.switched' = 'authentication.session.logout.locked',
  ): Promise<number> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const session = await transaction.userSession.findFirst({
        where: {
          id: identity.sessionId,
          userId: identity.userId,
          membershipId: identity.membershipId,
          tenantId: identity.tenantId,
          lockedAt: { not: null },
        },
        select: { familyId: true },
      });

      const now = new Date();
      const revokedCount = session
        ? await this.revokeFamily(
            transaction,
            session.familyId,
            now,
            'locked-session-terminated',
            'REVOKED',
          )
        : 0;

      await this.auditWriter.appendTenantUser(transaction, {
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        actorUserId: identity.userId,
        eventType,
        outcome: 'SUCCEEDED',
        resourceType: 'authentication-session',
        resourceId: identity.sessionId,
        metadata: { revokedCount },
        request: metadata,
      });
      return revokedCount;
    });
  }

  private async performUnlockRotation(
    transaction: Prisma.TransactionClient,
    parameters: {
      session: NonNullable<
        Awaited<ReturnType<Prisma.TransactionClient['userSession']['findUnique']>>
      >;
      credential: {
        id: string;
        hash: string;
        status: string;
        rotationSequence: number;
      };
      nextSessionId: string;
      nextRefreshTokenHash: string;
      unlockMethod: string;
      idleTtlSeconds: number;
      metadata: RequestMetadata;
      tenantActor: { tenantId: string; actorMembershipId: string; actorUserId: string };
      now: Date;
    },
  ): Promise<RotationResult> {
    const {
      session,
      credential,
      nextSessionId,
      nextRefreshTokenHash,
      unlockMethod,
      idleTtlSeconds,
      metadata,
      tenantActor,
      now,
    } = parameters;

    const claimed = await transaction.userSession.updateMany({
      where: {
        id: session.id,
        status: 'ACTIVE',
        lockedAt: { not: null },
        version: session.version,
        replacedById: null,
      },
      data: {
        status: 'ROTATED',
        unlockedAt: now,
        unlockMethod,
        lockedAt: null,
        lockReason: null,
        lastUsedAt: now,
        version: session.version + 1,
      },
    });

    if (claimed.count !== 1) {
      await this.writeRefreshFailure(
        transaction,
        tenantActor,
        session.id,
        session.familyId,
        'session-state-conflict',
        metadata,
      );
      return { status: 'INVALID' } as const;
    }

    const nextCredentialId = randomUUID();
    const idleExpiry = new Date(now.getTime() + idleTtlSeconds * 1000);
    const expiresAt = new Date(Math.min(idleExpiry.getTime(), session.absoluteExpiresAt.getTime()));

    await transaction.userSession.create({
      data: {
        id: nextSessionId,
        userId: session.userId,
        membershipId: session.membershipId,
        tenantId: session.tenantId,
        familyId: session.familyId,
        refreshTokenHash: nextRefreshTokenHash,
        expiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
        version: 1,
        // Carry forward the incremented security version so the fresh
        // access token is the ONLY valid token for the unlocked session.
        securityVersion: session.securityVersion,
        // Unlock is a real same-operator credential proof, so it establishes
        // a fresh recent-authentication instant.
        recentAuthenticatedAt: now,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceName: metadata.deviceName,
      },
    });

    await transaction.userSessionRefreshCredential.create({
      data: {
        id: nextCredentialId,
        sessionId: nextSessionId,
        hash: nextRefreshTokenHash,
        status: 'ACTIVE',
        rotationSequence: credential.rotationSequence + 1,
      },
    });

    const used = await transaction.userSessionRefreshCredential.updateMany({
      where: { id: credential.id, status: 'ACTIVE' },
      data: { status: 'USED', usedAt: now, replacedById: nextCredentialId },
    });
    if (used.count !== 1) {
      throw new Error('Session unlock rotation invariant violated: credential claim failed');
    }

    await transaction.userSession.update({
      where: { id: session.id },
      data: { replacedById: nextSessionId },
    });

    await this.auditWriter.appendTenantUser(transaction, {
      ...tenantActor,
      eventType: 'authentication.session.unlocked',
      outcome: 'SUCCEEDED',
      resourceType: 'authentication-session',
      resourceId: nextSessionId,
      metadata: { method: unlockMethod },
      request: metadata,
    });

    return {
      status: 'ROTATED',
      identity: {
        userId: session.userId,
        membershipId: session.membershipId,
        tenantId: session.tenantId,
        sessionId: nextSessionId,
        securityVersion: session.securityVersion,
      },
      expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    } as const;
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
      const session = await transaction.userSession.findUnique({
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

      if (!session) {
        await this.auditWriter.appendSystem(transaction, {
          eventType: 'authentication.session.refresh.failed',
          outcome: 'DENIED',
          resourceType: 'authentication-session',
          resourceId: data.currentSessionId,
          metadata: { reason: 'session-not-found' },
          request: data.metadata,
        });
        return { status: 'INVALID' } as const;
      }

      const tenantActor = {
        tenantId: session.membership.tenantId,
        actorMembershipId: session.membershipId,
        actorUserId: session.membership.userId,
      };

      const credential = await transaction.userSessionRefreshCredential.findFirst({
        where: {
          sessionId: session.id,
          hash: data.presentedHash,
        },
        select: {
          id: true,
          hash: true,
          status: true,
          usedAt: true,
          revokedAt: true,
          rotationSequence: true,
        },
      });

      let credentialState: PresentedCredentialState = 'UNKNOWN';
      if (credential?.status === 'ACTIVE') {
        credentialState = 'ACTIVE';
      } else if (credential?.status === 'USED') {
        credentialState = 'USED';
      } else if (credential?.status === 'REVOKED') {
        credentialState = 'REVOKED';
      }

      const decision = decideRotation({
        sessionStatus: session.status,
        sessionRevokedAt: session.revokedAt,
        sessionLockedAt: session.lockedAt,
        expiresAt: session.expiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
        credentialState,
        credentialRevokedAt: credential?.revokedAt ?? null,
        membershipStatus: session.membership.status,
        membershipDeletedAt: session.membership.deletedAt,
        userStatus: session.membership.user.status,
        userDeletedAt: session.membership.user.deletedAt,
        tenantIsActive: session.membership.tenant.isActive,
        tenantDeletedAt: session.membership.tenant.deletedAt,
        now,
      });

      switch (decision.outcome) {
        case 'REPLAY_DETECTED': {
          const revokedCount = await this.revokeFamily(
            transaction,
            session.familyId,
            now,
            'refresh-credential-replay',
            'COMPROMISED',
          );
          await this.auditWriter.appendTenantUser(transaction, {
            ...tenantActor,
            eventType: 'authentication.session.refresh.replayed',
            outcome: 'DENIED',
            resourceType: 'authentication-session-family',
            resourceId: session.familyId,
            metadata: { revokedCount },
            request: data.metadata,
          });
          return { status: 'REPLAY_DETECTED' } as const;
        }

        case 'REVOKED': {
          await this.writeRefreshFailure(
            transaction,
            tenantActor,
            session.id,
            session.familyId,
            'session-revoked',
            data.metadata,
          );
          return { status: 'REVOKED' } as const;
        }

        case 'EXPIRED': {
          await transaction.userSession.updateMany({
            where: { id: session.id, status: 'ACTIVE' },
            data: {
              status: 'EXPIRED',
              revokedAt: now,
              revocationReason: 'session-expired',
            },
          });
          await transaction.userSessionRefreshCredential.updateMany({
            where: { sessionId: session.id, status: 'ACTIVE' },
            data: { status: 'REVOKED', revokedAt: now },
          });
          await this.writeRefreshFailure(
            transaction,
            tenantActor,
            session.id,
            session.familyId,
            'session-expired',
            data.metadata,
          );
          return { status: 'EXPIRED' } as const;
        }

        case 'IDENTITY_DISABLED': {
          await this.revokeFamily(
            transaction,
            session.familyId,
            now,
            'identity-chain-inactive',
            'REVOKED',
          );
          await this.writeRefreshFailure(
            transaction,
            tenantActor,
            session.id,
            session.familyId,
            'identity-chain-inactive',
            data.metadata,
          );
          return { status: 'IDENTITY_DISABLED' } as const;
        }

        case 'LOCKED': {
          await this.writeRefreshFailure(
            transaction,
            tenantActor,
            session.id,
            session.familyId,
            'session-locked',
            data.metadata,
          );
          return { status: 'LOCKED' } as const;
        }

        case 'INVALID': {
          await this.writeRefreshFailure(
            transaction,
            tenantActor,
            session.id,
            session.familyId,
            'invalid-verifier',
            data.metadata,
          );
          return { status: 'INVALID' } as const;
        }

        case 'ROTATED': {
          return this.performRotation(transaction, {
            session,
            credential,
            nextSessionId: data.nextSessionId,
            nextRefreshTokenHash: data.nextRefreshTokenHash,
            idleTtlSeconds: data.idleTtlSeconds,
            metadata: data.metadata,
            tenantActor,
            now,
          });
        }
      }
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
          userId: identity.userId,
          membershipId: identity.membershipId,
          tenantId: identity.tenantId,
        },
        select: { familyId: true },
      });

      const now = new Date();
      const revokedCount = session
        ? await this.revokeFamily(transaction, session.familyId, now, 'user-logout', 'REVOKED')
        : 0;

      await this.auditWriter.appendTenantUser(transaction, {
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        actorUserId: identity.userId,
        eventType: 'authentication.session.logout.succeeded',
        outcome: 'SUCCEEDED',
        resourceType: 'authentication-session',
        resourceId: identity.sessionId,
        metadata: { revokedCount },
        request: metadata,
      });
      return revokedCount;
    });
  }

  async revokeAllForUser(
    identity: AuthenticatedIdentity,
    metadata: RequestMetadata = {},
  ): Promise<number> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const now = new Date();
      const affected = await transaction.userSession.findMany({
        where: {
          userId: identity.userId,
          status: { in: ['ACTIVE', 'ROTATED'] },
        },
        select: { id: true },
      });

      const revokedCount = await transaction.userSession.updateMany({
        where: {
          userId: identity.userId,
          status: { in: ['ACTIVE', 'ROTATED'] },
        },
        data: {
          status: 'REVOKED',
          revokedAt: now,
          revocationReason: 'user-logout-all',
        },
      });

      if (affected.length > 0) {
        await transaction.userSessionRefreshCredential.updateMany({
          where: {
            sessionId: { in: affected.map((value) => value.id) },
            status: 'ACTIVE',
          },
          data: { status: 'REVOKED', revokedAt: now },
        });
      }

      await this.auditWriter.appendPlatformUser(transaction, {
        platformActorUserId: identity.userId,
        eventType: 'authentication.sessions.logout.succeeded',
        outcome: 'SUCCEEDED',
        resourceType: 'global-user-sessions',
        resourceId: identity.userId,
        metadata: { revokedCount: revokedCount.count },
        request: metadata,
      });
      return revokedCount.count;
    });
  }

  /**
   * Marks a bounded, stably ordered batch of expired sessions `EXPIRED` and
   * revokes their active credentials. Idempotent: repeated calls with no new
   * expired sessions return zero.
   */
  async expireStaleSessions(batchSize: number = DEFAULT_CLEANUP_BATCH_SIZE): Promise<number> {
    if (
      !Number.isSafeInteger(batchSize) ||
      batchSize <= 0 ||
      batchSize > MAXIMUM_CLEANUP_BATCH_SIZE
    ) {
      throw new Error('Cleanup batch size must be between 1 and 10000');
    }

    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const now = new Date();
      const expired = await transaction.userSession.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ expiresAt: { lte: now } }, { absoluteExpiresAt: { lte: now } }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: batchSize,
        select: { id: true },
      });

      if (expired.length === 0) {
        return 0;
      }

      const ids = expired.map((value) => value.id);
      const marked = await transaction.userSession.updateMany({
        where: { id: { in: ids }, status: 'ACTIVE' },
        data: {
          status: 'EXPIRED',
          revokedAt: now,
          revocationReason: 'session-expired',
        },
      });

      await transaction.userSessionRefreshCredential.updateMany({
        where: { sessionId: { in: ids }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now },
      });

      return marked.count;
    });
  }

  private async performRotation(
    transaction: Prisma.TransactionClient,
    parameters: {
      session: NonNullable<
        Awaited<ReturnType<Prisma.TransactionClient['userSession']['findUnique']>>
      >;
      credential: {
        id: string;
        hash: string;
        status: string;
        rotationSequence: number;
      } | null;
      nextSessionId: string;
      nextRefreshTokenHash: string;
      idleTtlSeconds: number;
      metadata: RequestMetadata;
      tenantActor: { tenantId: string; actorMembershipId: string; actorUserId: string };
      now: Date;
    },
  ): Promise<RotationResult> {
    const {
      session,
      credential,
      nextSessionId,
      nextRefreshTokenHash,
      idleTtlSeconds,
      metadata,
      tenantActor,
      now,
    } = parameters;

    if (!credential || credential.status !== 'ACTIVE') {
      throw new Error('Session rotation invariant violated: active credential missing');
    }

    const claimed = await transaction.userSession.updateMany({
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
      // A concurrent rotation won the claim. Re-check the presented
      // credential: if it was consumed by the winner this is a confirmed
      // replay; otherwise it is an invalid state-conflict attempt.
      const recheck = await transaction.userSessionRefreshCredential.findFirst({
        where: { sessionId: session.id, hash: credential.hash },
        select: { status: true },
      });

      if (recheck?.status === 'USED') {
        const revokedCount = await this.revokeFamily(
          transaction,
          session.familyId,
          now,
          'refresh-credential-replay',
          'COMPROMISED',
        );
        await this.auditWriter.appendTenantUser(transaction, {
          ...tenantActor,
          eventType: 'authentication.session.refresh.replayed',
          outcome: 'DENIED',
          resourceType: 'authentication-session-family',
          resourceId: session.familyId,
          metadata: { revokedCount },
          request: metadata,
        });
        return { status: 'REPLAY_DETECTED' } as const;
      }

      await this.writeRefreshFailure(
        transaction,
        tenantActor,
        session.id,
        session.familyId,
        'session-state-conflict',
        metadata,
      );
      return { status: 'INVALID' } as const;
    }

    const nextCredentialId = randomUUID();
    const idleExpiry = new Date(now.getTime() + idleTtlSeconds * 1000);
    const expiresAt = new Date(Math.min(idleExpiry.getTime(), session.absoluteExpiresAt.getTime()));

    await transaction.userSession.create({
      data: {
        id: nextSessionId,
        userId: session.userId,
        membershipId: session.membershipId,
        tenantId: session.tenantId,
        familyId: session.familyId,
        refreshTokenHash: nextRefreshTokenHash,
        expiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
        version: 1,
        // Keep the family's security version across a normal refresh;
        // only a workstation lock increments it.
        securityVersion: session.securityVersion,
        // Refresh proves possession of the session credential, not a fresh
        // password/Google authentication. Preserve the prior instant exactly.
        recentAuthenticatedAt: session.recentAuthenticatedAt,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceName: metadata.deviceName,
      },
    });

    await transaction.userSessionRefreshCredential.create({
      data: {
        id: nextCredentialId,
        sessionId: nextSessionId,
        hash: nextRefreshTokenHash,
        status: 'ACTIVE',
        rotationSequence: credential.rotationSequence + 1,
      },
    });

    // Mark the presented credential consumed. The partial unique index
    // (`one ACTIVE credential per session`) guarantees only this transaction
    // can have claimed it.
    const used = await transaction.userSessionRefreshCredential.updateMany({
      where: { id: credential.id, status: 'ACTIVE' },
      data: { status: 'USED', usedAt: now, replacedById: nextCredentialId },
    });
    if (used.count !== 1) {
      throw new Error('Session rotation invariant violated: active credential claim failed');
    }

    await transaction.userSession.update({
      where: { id: session.id },
      data: { replacedById: nextSessionId },
    });

    await this.auditWriter.appendTenantUser(transaction, {
      ...tenantActor,
      eventType: 'authentication.session.refresh.succeeded',
      outcome: 'SUCCEEDED',
      resourceType: 'authentication-session',
      resourceId: nextSessionId,
      metadata: { previousSessionId: session.id },
      request: metadata,
    });

    return {
      status: 'ROTATED',
      identity: {
        userId: session.userId,
        membershipId: session.membershipId,
        tenantId: session.tenantId,
        sessionId: nextSessionId,
        securityVersion: session.securityVersion,
      },
      expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    } as const;
  }

  private async revokeFamily(
    transaction: Prisma.TransactionClient,
    familyId: string,
    now: Date,
    reason: string,
    status: 'COMPROMISED' | 'REVOKED',
  ): Promise<number> {
    const affected = await transaction.userSession.findMany({
      where: { familyId, status: { in: ['ACTIVE', 'ROTATED'] } },
      select: { id: true },
    });

    if (affected.length > 0) {
      await transaction.userSessionRefreshCredential.updateMany({
        where: {
          sessionId: { in: affected.map((value) => value.id) },
          status: 'ACTIVE',
        },
        data: { status: 'REVOKED', revokedAt: now },
      });
    }

    const revoked = await transaction.userSession.updateMany({
      where: { familyId, status: { in: ['ACTIVE', 'ROTATED'] } },
      data: { status, revokedAt: now, revocationReason: reason },
    });
    return revoked.count;
  }

  private async writeRefreshFailure(
    transaction: Prisma.TransactionClient,
    tenantActor: { tenantId: string; actorMembershipId: string; actorUserId: string },
    sessionId: string,
    familyId: string,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    await this.auditWriter.appendTenantUser(transaction, {
      ...tenantActor,
      eventType: 'authentication.session.refresh.failed',
      outcome: 'DENIED',
      resourceType: 'authentication-session',
      resourceId: sessionId,
      metadata: { reason },
      request: metadata,
    });
  }
}
