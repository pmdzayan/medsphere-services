import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenIdentity } from './auth.types';
import { TokenService } from './token.service';

export interface LockedSessionVerification {
  readonly identity: AccessTokenIdentity;
  readonly lockedAt: Date;
  readonly securityVersion: number;
}

export interface SessionStateVerification {
  readonly identity: AccessTokenIdentity;
  readonly locked: boolean;
  readonly lockedAt: Date | null;
  readonly securityVersion: number;
}

/**
 * Task 0014: non-mutating verification of a locked workstation session.
 *
 * The locked-session recovery routes (unlock, logout-locked, switch-user)
 * cannot use the normal JWT path because locking increments securityVersion
 * and sets lockedAt, which makes every pre-lock access token fail closed.
 * This service verifies the session's own opaque, single-use refresh
 * credential WITHOUT consuming or rotating it -- the authoritative unlock
 * rotation (or family revocation) happens later in the actual operation.
 *
 * It performs only read-only Prisma queries and reuses the existing
 * TokenService parse/hash primitives. It never logs the credential or its
 * verifier, and it fails closed for invalid, revoked, expired, wrong-family,
 * or unlocked sessions.
 */
@Injectable()
export class LockedSessionVerifierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Verifies that the presented refresh credential belongs to a currently
   * LOCKED, ACTIVE, non-expired session with an active identity chain.
   * Returns the server-derived identity. Non-mutating: no rotation, no
   * revocation, no credential consumption.
   */
  async verifyLockedSession(refreshCredential: string): Promise<LockedSessionVerification> {
    const parts = this.tokenService.parseRefreshCredential(refreshCredential);
    const presentedHash = this.tokenService.hashRefreshCredential(refreshCredential);
    const now = new Date();

    const session = await this.prisma.client.userSession.findFirst({
      where: {
        id: parts.sessionId,
        status: 'ACTIVE',
        lockedAt: { not: null },
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
        refreshCredentials: {
          some: {
            hash: presentedHash,
            status: 'ACTIVE',
          },
        },
        membership: {
          status: 'ACTIVE',
          deletedAt: null,
          user: {
            status: 'ACTIVE',
            deletedAt: null,
          },
          tenant: {
            isActive: true,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        userId: true,
        membershipId: true,
        tenantId: true,
        lockedAt: true,
        securityVersion: true,
      },
    });

    if (!session || session.lockedAt === null) {
      throw new UnauthorizedException('Authentication required');
    }

    return {
      identity: {
        userId: session.userId,
        membershipId: session.membershipId,
        tenantId: session.tenantId,
        sessionId: session.id,
        securityVersion: session.securityVersion,
      },
      lockedAt: session.lockedAt,
      securityVersion: session.securityVersion,
    };
  }

  /**
   * Verifies the presented refresh credential and reports the current
   * server-side session state (locked or active) without granting access to
   * any protected data. Used by the current-session-state endpoint so the
   * web BFF can determine whether the workstation is locked. Non-mutating.
   */
  async verifySessionState(refreshCredential: string): Promise<SessionStateVerification> {
    const parts = this.tokenService.parseRefreshCredential(refreshCredential);
    const presentedHash = this.tokenService.hashRefreshCredential(refreshCredential);
    const now = new Date();

    const session = await this.prisma.client.userSession.findFirst({
      where: {
        id: parts.sessionId,
        status: 'ACTIVE',
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
        refreshCredentials: {
          some: {
            hash: presentedHash,
            status: 'ACTIVE',
          },
        },
        membership: {
          status: 'ACTIVE',
          deletedAt: null,
          user: {
            status: 'ACTIVE',
            deletedAt: null,
          },
          tenant: {
            isActive: true,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        userId: true,
        membershipId: true,
        tenantId: true,
        lockedAt: true,
        securityVersion: true,
      },
    });

    if (!session) {
      throw new UnauthorizedException('Authentication required');
    }

    return {
      identity: {
        userId: session.userId,
        membershipId: session.membershipId,
        tenantId: session.tenantId,
        sessionId: session.id,
        securityVersion: session.securityVersion,
      },
      locked: session.lockedAt !== null,
      lockedAt: session.lockedAt,
      securityVersion: session.securityVersion,
    };
  }
}
