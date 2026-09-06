import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuditWriter } from '../audit/audit-writer.service';
import { RequestMetadata } from '../auth/auth.types';
import { withSerializableRetry } from '../prisma/transaction.util';
import { PlatformRepository } from './platform.repository';
import { PlatformSessionRepository } from './platform-session.repository';
import { PlatformAuthenticatedIdentity } from './platform.types';
import { PLATFORM_OWNER_ROLE_KEY, PlatformRoleKey } from './platform.constants';

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: PlatformRepository,
    private readonly sessions: PlatformSessionRepository,
    private readonly auditWriter: AuditWriter,
  ) {}

  /**
   * Reads the authenticated platform actor's OWN platform identity, roles,
   * and permissions. No tenant/clinical data.
   */
  async readPlatformIdentity(identity: PlatformAuthenticatedIdentity) {
    const account = await this.repository.findPlatformAccountById(identity.platformAccountId);
    if (!account) {
      throw new NotFoundException('Platform account not found');
    }
    const roleKeys = (
      await this.prisma.client.platformRoleAssignment.findMany({
        where: { platformAccountId: identity.platformAccountId },
        select: { grantedRoleKey: true },
      })
    ).map((a) => a.grantedRoleKey as PlatformRoleKey);
    const permissions = await this.repository.findEffectivePlatformPermissions(
      identity.platformAccountId,
    );

    return {
      platformAccountId: account.id,
      userId: account.user.id,
      email: account.user.email,
      firstName: account.user.firstName,
      lastName: account.user.lastName,
      roles: [...new Set(roleKeys)].sort(),
      permissions: [...new Set(permissions)].sort(),
    };
  }

  async listPlatformAdmins(limit: number, cursor?: string) {
    const page = await this.repository.listPlatformAccounts(limit, cursor);
    return { ...page, limit };
  }
  async suspendPlatformAdmin(
    actor: PlatformAuthenticatedIdentity,
    platformAccountId: string,
    request: RequestMetadata = {},
  ) {
    if (actor.platformAccountId === platformAccountId) {
      throw new ForbiddenException('Self-suspension of platform access is not permitted');
    }

    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const target = await transaction.platformAccount.findFirst({
        where: { id: platformAccountId, deletedAt: null },
        include: {
          user: { select: { id: true, email: true } },
          roleAssignments: { select: { grantedRoleKey: true } },
        },
      });
      if (!target) {
        throw new NotFoundException('Platform account not found');
      }
      if (target.status !== 'ACTIVE') {
        throw new ConflictException('Platform account is not active');
      }

      // An ordinary PLATFORM_ADMIN cannot suspend a protected owner.
      const targetIsOwner = target.roleAssignments.some(
        (a) => a.grantedRoleKey === PLATFORM_OWNER_ROLE_KEY,
      );
      const actorRoleKeys = await transaction.platformRoleAssignment
        .findMany({
          where: { platformAccountId: actor.platformAccountId },
          select: { grantedRoleKey: true },
        })
        .then((assignments) => assignments.map((a) => a.grantedRoleKey));
      if (targetIsOwner && !actorRoleKeys.includes(PLATFORM_OWNER_ROLE_KEY)) {
        throw new ForbiddenException(
          'The protected platform owner cannot be suspended by a platform administrator',
        );
      }

      const updated = await transaction.platformAccount.updateMany({
        where: { id: platformAccountId, status: 'ACTIVE', deletedAt: null },
        data: { status: 'SUSPENDED', version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Platform account is not active');
      }

      // Immediate revocation: all active platform sessions are revoked.
      const activeSessions = await transaction.platformSession.findMany({
        where: { userId: target.user.id, status: 'ACTIVE' },
        select: { id: true },
      });
      const sessionIds = activeSessions.map((s) => s.id);
      if (sessionIds.length > 0) {
        await transaction.platformSessionRefreshCredential.updateMany({
          where: { platformSessionId: { in: sessionIds }, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: new Date() },
        });
        await transaction.platformSession.updateMany({
          where: { id: { in: sessionIds }, status: 'ACTIVE' },
          data: {
            status: 'REVOKED',
            revokedAt: new Date(),
            revocationReason: 'platform-admin-suspended',
          },
        });
      }

      await this.auditWriter.appendPlatformUser(transaction, {
        platformActorUserId: actor.userId,
        eventType: 'platform.admin.suspended',
        outcome: 'SUCCEEDED',
        resourceType: 'platform-account',
        resourceId: platformAccountId,
        metadata: { targetPlatformUserId: target.user.id, revokedSessionCount: sessionIds.length },
        request,
      });

      return {
        platformAccountId: target.id,
        status: 'SUSPENDED' as const,
        revokedSessionCount: sessionIds.length,
      };
    });
  }
  async reactivatePlatformAdmin(
    actor: PlatformAuthenticatedIdentity,
    platformAccountId: string,
    request: RequestMetadata = {},
  ) {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const target = await transaction.platformAccount.findFirst({
        where: { id: platformAccountId, deletedAt: null },
        include: { user: { select: { id: true } } },
      });
      if (!target) {
        throw new NotFoundException('Platform account not found');
      }
      if (target.status !== 'SUSPENDED') {
        throw new ConflictException('Platform account is not suspended');
      }

      const updated = await transaction.platformAccount.updateMany({
        where: { id: platformAccountId, status: 'SUSPENDED', deletedAt: null },
        data: { status: 'ACTIVE', version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Platform account is not suspended');
      }

      await this.auditWriter.appendPlatformUser(transaction, {
        platformActorUserId: actor.userId,
        eventType: 'platform.admin.reactivated',
        outcome: 'SUCCEEDED',
        resourceType: 'platform-account',
        resourceId: platformAccountId,
        metadata: { targetPlatformUserId: target.user.id },
        request,
      });

      return { platformAccountId: target.id, status: 'ACTIVE' as const };
    });
  }

  /**
   * One-time initial-owner bootstrap. Operator-invoked only (a dedicated
   * CLI/script, never a browser/public endpoint). Refuses once an active
   * PLATFORM_OWNER exists; transactionally creates the protected owner
   * assignment; emits durable bootstrap evidence; never hard-codes an
   * email/user id in application source.
   */
  async bootstrapInitialOwner(userId: string, request: RequestMetadata = {}) {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const existingOwner = await transaction.platformRoleAssignment.count({
        where: {
          grantedRoleKey: PLATFORM_OWNER_ROLE_KEY,
          platformAccount: { status: 'ACTIVE', deletedAt: null },
        },
      });
      if (existingOwner > 0) {
        throw new ConflictException('An active PLATFORM_OWNER already exists');
      }

      const user = await transaction.user.findFirst({
        where: { id: userId, status: 'ACTIVE', deletedAt: null },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      if (!user) {
        throw new NotFoundException('Active global AIM user not found');
      }

      const ownerRole = await transaction.platformRole.findFirst({
        where: { key: PLATFORM_OWNER_ROLE_KEY, deletedAt: null },
        select: { id: true },
      });
      if (!ownerRole) {
        throw new Error('Platform owner role is not seeded');
      }

      let account = await transaction.platformAccount.findFirst({
        where: { userId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!account) {
        account = await transaction.platformAccount.create({
          data: { id: randomUUID(), userId, status: 'ACTIVE' },
          select: { id: true, status: true },
        });
      } else if (account.status !== 'ACTIVE') {
        throw new ConflictException('Platform account is not active');
      }

      const assignment = await transaction.platformRoleAssignment.create({
        data: {
          id: randomUUID(),
          platformAccountId: account.id,
          roleId: ownerRole.id,
          grantedRoleKey: PLATFORM_OWNER_ROLE_KEY,
          createdByPlatformUserId: null, // bootstrap is not a human platform action
        },
        select: { id: true },
      });

      await this.auditWriter.appendSystem(transaction, {
        eventType: 'platform.owner.bootstrap',
        outcome: 'SUCCEEDED',
        resourceType: 'platform-role-assignment',
        resourceId: assignment.id,
        metadata: { targetPlatformUserId: userId, targetRoleKey: PLATFORM_OWNER_ROLE_KEY },
        request,
      });

      return {
        platformAccountId: account.id,
        userId,
        roleKey: PLATFORM_OWNER_ROLE_KEY,
        assignmentId: assignment.id,
      };
    });
  }
}
