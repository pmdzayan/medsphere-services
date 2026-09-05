import { Injectable } from '@nestjs/common';
import { Prisma } from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';
import { PLATFORM_OWNER_ROLE_KEY, PlatformRoleKey } from './platform.constants';
import { normalizeAuthenticationLocator } from '../auth/auth-normalization';

export interface PlatformAccountSummary {
  readonly platformAccountId: string;
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly status: 'ACTIVE' | 'SUSPENDED';
  readonly roles: readonly PlatformRoleKey[];
  readonly createdAt: string;
}

export interface PlatformCursorEntry {
  readonly createdAt: Date;
  readonly platformAccountId: string;
}

export interface PlatformAccountCursorPage {
  readonly data: readonly PlatformAccountSummary[];
  readonly nextCursor: string | null;
}

const listAccountInclude = {
  roleAssignments: {
    select: { grantedRoleKey: true },
  },
  user: {
    select: { id: true, email: true, firstName: true, lastName: true, status: true },
  },
} as const;

@Injectable()
export class PlatformRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveUserByEmail(email: string) {
    const normalized = normalizeAuthenticationLocator(email);
    return this.prisma.client.user.findFirst({
      where: { email: normalized, status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        preferredLanguage: true,
        passwordHash: true,
      },
    });
  }

  async findActiveUserByGoogleSubject(subject: string) {
    return this.prisma.client.user.findFirst({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        externalAuthIdentities: {
          some: { provider: 'GOOGLE', subject },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        preferredLanguage: true,
        passwordHash: true,
        externalAuthIdentities: {
          where: { provider: 'GOOGLE', subject },
          select: { email: true, emailVerified: true },
          take: 1,
        },
      },
    });
  }
  async findPlatformAccountByUserId(userId: string) {
    return this.prisma.client.platformAccount.findFirst({
      where: { userId, deletedAt: null },
      include: {
        roleAssignments: {
          include: { role: { select: { key: true, isProtected: true } } },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            preferredLanguage: true,
          },
        },
      },
    });
  }

  async findPlatformAccountById(platformAccountId: string) {
    return this.prisma.client.platformAccount.findFirst({
      where: { id: platformAccountId, deletedAt: null },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, status: true },
        },
      },
    });
  }

  async hasActivePlatformOwner() {
    const count = await this.prisma.client.platformRoleAssignment.count({
      where: {
        grantedRoleKey: PLATFORM_OWNER_ROLE_KEY,
        platformAccount: { status: 'ACTIVE', deletedAt: null },
      },
    });
    return count > 0;
  }

  async findPlatformRoleByKey(key: PlatformRoleKey) {
    return this.prisma.client.platformRole.findFirst({
      where: { key, deletedAt: null },
      select: { id: true, key: true, isProtected: true },
    });
  }
  private encodeCursor(entry: PlatformCursorEntry): string {
    const payload = JSON.stringify({
      c: entry.createdAt.toISOString(),
      i: entry.platformAccountId,
    });
    return Buffer.from(payload, 'utf8').toString('base64url');
  }

  private decodeCursor(value: string): PlatformCursorEntry | null {
    try {
      const payload = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
        c?: unknown;
        i?: unknown;
      };
      if (typeof payload.c !== 'string' || typeof payload.i !== 'string') {
        return null;
      }
      const createdAt = new Date(payload.c);
      if (Number.isNaN(createdAt.getTime())) {
        return null;
      }
      return { createdAt, platformAccountId: payload.i };
    } catch {
      return null;
    }
  }

  async listPlatformAccounts(
    limit: number,
    cursor: string | undefined,
  ): Promise<PlatformAccountCursorPage> {
    const decoded = cursor ? this.decodeCursor(cursor) : null;
    const where: Prisma.PlatformAccountWhereInput = { deletedAt: null };
    if (decoded) {
      where.OR = [
        { createdAt: { lt: decoded.createdAt } },
        { createdAt: decoded.createdAt, id: { lt: decoded.platformAccountId } },
      ];
    }

    const accounts = await this.prisma.client.platformAccount.findMany({
      where,
      include: listAccountInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = accounts.length > limit;
    const page = accounts.slice(0, limit);
    const last = page[page.length - 1];

    return {
      data: page.map((account) => ({
        platformAccountId: account.id,
        userId: account.user.id,
        email: account.user.email,
        firstName: account.user.firstName,
        lastName: account.user.lastName,
        status: account.status,
        roles: account.roleAssignments.map((a) => a.grantedRoleKey as PlatformRoleKey),
        createdAt: account.createdAt.toISOString(),
      })),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({ createdAt: last.createdAt, platformAccountId: last.id })
          : null,
    };
  }

  /**
   * Effective platform permission keys, read live (no cache). Only
   * PlatformRolePermission bindings are consulted -- tenant RolePermission
   * bindings are structurally ignored, so tenant permissions can never become
   * platform authority.
   */
  async findEffectivePlatformPermissions(platformAccountId: string): Promise<string[]> {
    return this.findEffectivePlatformPermissionsOnClient(this.prisma.client, platformAccountId);
  }

  private async findEffectivePlatformPermissionsOnClient(
    client: Prisma.TransactionClient,
    platformAccountId: string,
  ): Promise<string[]> {
    const assignments = await client.platformRoleAssignment.findMany({
      where: {
        platformAccountId,
        platformAccount: { status: 'ACTIVE', deletedAt: null },
        role: { deletedAt: null },
      },
      select: {
        role: {
          select: {
            rolePermissions: {
              select: { permission: { select: { name: true } } },
            },
          },
        },
      },
    });

    const keys = new Set<string>();
    for (const assignment of assignments) {
      for (const mapping of assignment.role.rolePermissions) {
        keys.add(mapping.permission.name);
      }
    }
    return [...keys];
  }

  get transactionClient() {
    return this.prisma.client;
  }
}
