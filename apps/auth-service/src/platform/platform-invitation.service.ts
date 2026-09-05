import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@medsphere/database';

import { PrismaService } from '../prisma/prisma.service';
import { AuditWriter } from '../audit/audit-writer.service';
import { AuthConfigService } from '../auth/auth-config.service';
import { PasswordService } from '../auth/password.service';
import { RequestMetadata } from '../auth/auth.types';
import { withSerializableRetry } from '../prisma/transaction.util';
import { PlatformRepository } from './platform.repository';
import {
  createPlatformInvitationProof,
  hashPlatformInvitation,
  isPlausiblePlatformInvitationProof,
} from './platform-invitation.util';
import { INVITATION_GRANTABLE_ROLE_KEYS, PlatformRoleKey } from './platform.constants';

type GrantableInvitationRoleKey = (typeof INVITATION_GRANTABLE_ROLE_KEYS)[number];

function isGrantableInvitationRoleKey(value: string): value is GrantableInvitationRoleKey {
  return INVITATION_GRANTABLE_ROLE_KEYS.includes(value as GrantableInvitationRoleKey);
}

export interface PlatformInvitationAcceptance {
  readonly platformAccount: {
    readonly id: string;
    readonly userId: string;
    readonly status: 'ACTIVE' | 'SUSPENDED';
    readonly user: {
      readonly email: string;
      readonly firstName: string;
      readonly lastName: string;
    };
  };
}

@Injectable()
export class PlatformInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: PlatformRepository,
    private readonly auditWriter: AuditWriter,
    private readonly authConfig: AuthConfigService,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Creates an invitation that can ONLY grant a PLATFORM_ADMIN role. The
   * plaintext proof is returned once to the authorized creator and is never
   * persisted -- only its HMAC digest is stored.
   */
  async createInvitation(
    actorUserId: string,
    targetEmail: string,
    roleKey: (typeof INVITATION_GRANTABLE_ROLE_KEYS)[number],
    ttlDays: number,
    request: RequestMetadata = {},
  ): Promise<{
    invitationId: string;
    roleKey: PlatformRoleKey;
    invitationToken: string;
    expiresAt: Date;
  }> {
    if (!INVITATION_GRANTABLE_ROLE_KEYS.includes(roleKey)) {
      throw new BadRequestException(
        'The requested platform role cannot be granted through an invitation',
      );
    }

    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + ttlDays);

    const proof = createPlatformInvitationProof(this.authConfig.value.orgJoinCodePepper);

    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const role = await transaction.platformRole.findFirst({
        where: { key: roleKey, deletedAt: null },
        select: { id: true },
      });
      if (!role) {
        throw new BadRequestException('The requested platform role does not exist');
      }

      const existing = await transaction.platformInvitation.findFirst({
        where: {
          targetEmail,
          roleId: role.id,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('A pending invitation already exists for this recipient');
      }

      const invitation = await transaction.platformInvitation.create({
        data: {
          id: randomUUID(),
          targetEmail,
          roleId: role.id,
          invitationHash: proof.digest,
          status: 'PENDING',
          expiresAt,
          createdByPlatformUserId: actorUserId,
        },
        select: { id: true },
      });

      await this.auditWriter.appendPlatformUser(transaction, {
        platformActorUserId: actorUserId,
        eventType: 'platform.invitation.created',
        outcome: 'SUCCEEDED',
        resourceType: 'platform-invitation',
        resourceId: invitation.id,
        metadata: { targetRoleKey: roleKey, invitationId: invitation.id },
        request,
      });

      return { invitationId: invitation.id, roleKey, invitationToken: proof.value, expiresAt };
    });
  }
  async listInvitations(actorUserId: string, limit: number, _cursor: string | undefined) {
    // Deterministic bounded listing of ALL invitations (including revoked),
    // newest first. No sensitive fields: never exposes hashes, tokens, or
    // full recipient personal data.
    const invitations = await this.prisma.client.platformInvitation.findMany({
      include: { role: { select: { key: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return {
      data: invitations.map((invitation) => ({
        invitationId: invitation.id,
        status: invitation.status,
        roleKey: invitation.role.key as PlatformRoleKey,
        expiresAt: invitation.expiresAt.toISOString(),
        acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
      })),
      nextCursor: null,
      limit,
    };
  }

  /**
   * Revokes a pending invitation before acceptance. Requires the actor to be
   * a platform manager. The plaintext proof (never persisted) simply becomes
   * unusable; only a digest exists in the database.
   */
  async revokeInvitation(
    actorUserId: string,
    invitationId: string,
    request: RequestMetadata = {},
  ): Promise<void> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const invitation = await transaction.platformInvitation.findFirst({
        where: { id: invitationId, status: 'PENDING', revokedAt: null },
        select: { id: true, role: { select: { key: true } } },
      });

      if (!invitation) {
        throw new NotFoundException('Pending invitation not found');
      }

      const updated = await transaction.platformInvitation.updateMany({
        where: { id: invitationId, status: 'PENDING', revokedAt: null },
        data: { status: 'REVOKED', revokedAt: new Date(), revokedByPlatformUserId: actorUserId },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Invitation has already been accepted or revoked');
      }

      await this.auditWriter.appendPlatformUser(transaction, {
        platformActorUserId: actorUserId,
        eventType: 'platform.invitation.revoked',
        outcome: 'SUCCEEDED',
        resourceType: 'platform-invitation',
        resourceId: invitationId,
        metadata: { targetRoleKey: invitation.role.key as PlatformRoleKey, invitationId },
        request,
      });
    });
  }

  async getInvitation(actorUserId: string, invitationId: string) {
    const invitation = await this.prisma.client.platformInvitation.findFirst({
      where: { id: invitationId },
      include: { role: { select: { key: true } } },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    return {
      invitationId: invitation.id,
      status: invitation.status,
      roleKey: invitation.role.key as PlatformRoleKey,
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    };
  }

  async acceptWithPassword(
    invitationToken: string,
    email: string,
    password: string,
    request: RequestMetadata = {},
  ): Promise<PlatformInvitationAcceptance | null> {
    if (!isPlausiblePlatformInvitationProof(invitationToken)) {
      return null;
    }

    const user = await this.repository.findActiveUserByEmail(email);
    if (!user || !user.passwordHash) {
      await this.passwordService.verifyAgainstDummy(password);
      return null;
    }

    const passwordValid = await this.passwordService.verify(user.passwordHash, password);
    if (!passwordValid) {
      return null;
    }

    const digest = hashPlatformInvitation(invitationToken, this.authConfig.value.orgJoinCodePepper);

    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const invitation = await transaction.platformInvitation.findUnique({
        where: { invitationHash: digest },
        select: {
          id: true,
          targetEmail: true,
          roleId: true,
          role: { select: { key: true } },
          status: true,
          expiresAt: true,
          revokedAt: true,
          version: true,
        },
      });

      if (!invitation) {
        return null;
      }
      if (invitation.status !== 'PENDING' || invitation.revokedAt !== null) {
        return null;
      }
      if (invitation.expiresAt.getTime() <= Date.now()) {
        return null;
      }
      if (invitation.targetEmail.toLowerCase() !== email.toLowerCase()) {
        return null;
      }
      if (!isGrantableInvitationRoleKey(invitation.role.key)) {
        return null;
      }

      // Single-use claim: only one concurrent acceptance can transition a
      // PENDING invitation to ACCEPTED (version gate).
      const claimed = await transaction.platformInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING', version: invitation.version },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedByUserId: user.id,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        return null;
      }

      return this.provisionPlatformAccess(
        transaction,
        user.id,
        invitation.id,
        invitation.role.key as PlatformRoleKey,
        user.email,
        user.firstName,
        user.lastName,
        request,
      );
    });
  }
  async acceptWithGoogle(
    invitationToken: string,
    googleIdentity: { subject: string; email: string; emailVerified: true },
    request: RequestMetadata = {},
  ): Promise<PlatformInvitationAcceptance | null> {
    if (!isPlausiblePlatformInvitationProof(invitationToken)) {
      return null;
    }

    const digest = hashPlatformInvitation(invitationToken, this.authConfig.value.orgJoinCodePepper);

    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const invitation = await transaction.platformInvitation.findUnique({
        where: { invitationHash: digest },
        select: {
          id: true,
          targetEmail: true,
          roleId: true,
          role: { select: { key: true } },
          status: true,
          expiresAt: true,
          revokedAt: true,
          version: true,
        },
      });

      if (!invitation) {
        return null;
      }
      if (invitation.status !== 'PENDING' || invitation.revokedAt !== null) {
        return null;
      }
      if (invitation.expiresAt.getTime() <= Date.now()) {
        return null;
      }
      if (invitation.targetEmail.toLowerCase() !== googleIdentity.email.toLowerCase()) {
        return null;
      }
      if (!isGrantableInvitationRoleKey(invitation.role.key)) {
        return null;
      }

      const user = await transaction.user.findFirst({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          externalAuthIdentities: {
            some: { provider: 'GOOGLE', subject: googleIdentity.subject },
          },
        },
        select: { id: true, email: true, firstName: true, lastName: true },
      });

      if (!user) {
        return null;
      }

      const claimed = await transaction.platformInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING', version: invitation.version },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedByUserId: user.id,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        return null;
      }

      return this.provisionPlatformAccess(
        transaction,
        user.id,
        invitation.id,
        invitation.role.key as PlatformRoleKey,
        user.email,
        user.firstName,
        user.lastName,
        request,
      );
    });
  }
  private async provisionPlatformAccess(
    transaction: Prisma.TransactionClient,
    userId: string,
    invitationId: string,
    roleKey: PlatformRoleKey,
    email: string,
    firstName: string,
    lastName: string,
    request: RequestMetadata,
  ): Promise<PlatformInvitationAcceptance> {
    // Create (or reuse) the platform account for this exact global user.
    let account = await transaction.platformAccount.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true, status: true, userId: true },
    });
    if (!account) {
      account = await transaction.platformAccount.create({
        data: { id: randomUUID(), userId, status: 'ACTIVE' },
        select: { id: true, status: true, userId: true },
      });
    }

    const role = await transaction.platformRole.findFirst({
      where: { key: roleKey, deletedAt: null },
      select: { id: true },
    });
    if (!role) {
      throw new NotFoundException('Platform role does not exist');
    }

    await transaction.platformRoleAssignment.create({
      data: {
        id: randomUUID(),
        platformAccountId: account.id,
        roleId: role.id,
        grantedRoleKey: roleKey,
        createdByPlatformUserId: null, // invitation acceptance is not a management action
      },
    });

    await this.auditWriter.appendPlatformUser(transaction, {
      platformActorUserId: userId,
      eventType: 'platform.invitation.accepted',
      outcome: 'SUCCEEDED',
      resourceType: 'platform-invitation',
      resourceId: invitationId,
      metadata: { targetRoleKey: roleKey, invitationId },
      request,
    });

    await this.auditWriter.appendPlatformUser(transaction, {
      platformActorUserId: userId,
      eventType: 'platform.role.assigned',
      outcome: 'SUCCEEDED',
      resourceType: 'platform-role-assignment',
      resourceId: role.id,
      metadata: { targetPlatformUserId: userId, roleKey },
      request,
    });

    return {
      platformAccount: {
        id: account.id,
        userId: account.userId,
        status: account.status as 'ACTIVE' | 'SUSPENDED',
        user: { email, firstName, lastName },
      },
    };
  }
}
