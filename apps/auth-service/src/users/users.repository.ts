import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoginIdentity } from '../auth/auth.types';
import { hasPrismaCode, withSerializableRetry } from '../prisma/transaction.util';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findGoogleLoginIdentity(
    tenantSlug: string,
    subject: string,
  ): Promise<LoginIdentity | null> {
    const membership = await this.prisma.client.tenantMembership.findFirst({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        tenant: {
          slug: tenantSlug,
          isActive: true,
          deletedAt: null,
        },
        user: {
          status: 'ACTIVE',
          deletedAt: null,
          externalAuthIdentities: {
            some: {
              provider: 'GOOGLE',
              subject,
            },
          },
        },
      },
      select: {
        id: true,
        tenantId: true,
        user: {
          select: {
            id: true,
            email: true,
            passwordHash: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!membership) {
      return null;
    }

    return {
      user: membership.user,
      membershipId: membership.id,
      tenantId: membership.tenantId,
    };
  }

  async findLoginIdentity(tenantSlug: string, email: string): Promise<LoginIdentity | null> {
    const membership = await this.prisma.client.tenantMembership.findFirst({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        tenant: {
          slug: tenantSlug,
          isActive: true,
          deletedAt: null,
        },
        user: {
          email,
          status: 'ACTIVE',
          deletedAt: null,
        },
      },
      select: {
        id: true,
        tenantId: true,
        user: {
          select: {
            id: true,
            email: true,
            passwordHash: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!membership) {
      return null;
    }

    return {
      user: membership.user,
      membershipId: membership.id,
      tenantId: membership.tenantId,
    };
  }

  async findById(id: string) {
    return this.prisma.client.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  /**
   * Public onboarding never attaches an existing global identity to another
   * tenant. That requires a verified invitation flow in a later sprint.
   */
  async createPendingRegistration(data: {
    tenantSlug: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }): Promise<void> {
    try {
      await withSerializableRetry(this.prisma.client, async (transaction) => {
        const tenant = await transaction.tenant.findFirst({
          where: {
            slug: data.tenantSlug,
            isActive: true,
            selfRegistrationEnabled: true,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (!tenant) {
          return;
        }

        const existingUser = await transaction.user.findUnique({
          where: { email: data.email },
          select: { id: true },
        });

        if (existingUser) {
          return;
        }

        const user = await transaction.user.create({
          data: {
            email: data.email,
            passwordHash: data.passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            status: 'PENDING_VERIFICATION',
          },
          select: { id: true },
        });

        await transaction.tenantMembership.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            status: 'PENDING',
          },
        });
      });
    } catch (error) {
      // A concurrent request may win the global-email uniqueness race. The
      // public response remains deliberately identical to avoid enumeration.
      if (hasPrismaCode(error, 'P2002')) {
        return;
      }
      throw error;
    }
  }

  async update(
    id: string,
    data: {
      email?: string;
      passwordHash?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
      preferredLanguage?: string;
    },
  ) {
    return this.prisma.client.user.update({
      where: { id },
      data,
    });
  }
}
