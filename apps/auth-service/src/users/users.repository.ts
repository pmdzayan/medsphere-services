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
        tenant: { select: { name: true, organizationType: true } },
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
      tenant: membership.tenant,
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
        tenant: { select: { name: true, organizationType: true } },
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
      tenant: membership.tenant,
    };
  }

  async findById(id: string) {
    return this.prisma.client.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  /**
   * Global (non-tenant-scoped) identity lookup by email, used only by the
   * slug-free login flow (Task 0010) to verify the person's password
   * exactly once before resolving which organization(s) they belong to.
   * Never used to bypass tenant-scoped authorization -- every subsequent
   * step still resolves membership access explicitly (see
   * findActiveMembershipsForUser below), and no data beyond what is
   * needed to verify a password and greet the user is returned.
   */
  async findGlobalIdentityByEmail(email: string): Promise<{
    id: string;
    email: string;
    passwordHash: string | null;
    firstName: string;
    lastName: string;
  } | null> {
    return this.prisma.client.user.findFirst({
      where: { email, status: 'ACTIVE', deletedAt: null },
      select: { id: true, email: true, passwordHash: true, firstName: true, lastName: true },
    });
  }

  /**
   * Every ACTIVE membership, in an ACTIVE tenant, belonging to the given
   * (already password-verified) user. Only organization display
   * information the authenticated user is already authorized to know
   * about their own memberships -- never a general tenant search or
   * listing. A PENDING membership is deliberately excluded: it does not
   * yet grant login access to that organization context.
   */
  async findActiveMembershipsForUser(userId: string): Promise<
    Array<{
      membershipId: string;
      tenantId: string;
      organizationName: string;
      organizationType: string;
    }>
  > {
    const memberships = await this.prisma.client.tenantMembership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        deletedAt: null,
        tenant: { isActive: true, deletedAt: null },
      },
      select: {
        id: true,
        tenantId: true,
        tenant: { select: { name: true, organizationType: true } },
      },
    });
    return memberships.map((membership) => ({
      membershipId: membership.id,
      tenantId: membership.tenantId,
      tenant: membership.tenant,
      organizationName: membership.tenant.name,
      organizationType: membership.tenant.organizationType,
    }));
  }

  /**
   * Resolves a single specific membership for session issuance, scoped
   * to the given (already password-verified) userId -- so a membershipId
   * alone, without the matching userId, can never resolve to a session.
   * Mirrors findLoginIdentity's ACTIVE/ACTIVE shape exactly.
   */
  async findLoginIdentityByMembershipId(
    userId: string,
    membershipId: string,
  ): Promise<LoginIdentity | null> {
    const membership = await this.prisma.client.tenantMembership.findFirst({
      where: {
        id: membershipId,
        userId,
        status: 'ACTIVE',
        deletedAt: null,
        tenant: { isActive: true, deletedAt: null },
      },
      select: {
        id: true,
        tenantId: true,
        tenant: { select: { name: true, organizationType: true } },
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

    if (!membership || membership.user.id !== userId) {
      return null;
    }

    return {
      user: membership.user,
      membershipId: membership.id,
      tenantId: membership.tenantId,
      tenant: membership.tenant,
    };
  }

  /**
   * Public onboarding never attaches an existing global identity to another
   * tenant. That requires a verified invitation flow in a later sprint.
   */
  async createPendingRegistration(data: {
    tenantSlug: string;
    email: string;
    phone: string;
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
            phone: data.phone,
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

  /**
   * Public Google onboarding follows the same tenant boundary as password
   * registration: it never attaches an existing global user to another tenant.
   * The Google subject and email must already have been verified upstream.
   */
  async createPendingGoogleRegistration(data: {
    tenantSlug: string;
    subject: string;
    email: string;
    phone: string;
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

        const existingExternalIdentity = await transaction.externalAuthIdentity.findFirst({
          where: {
            provider: 'GOOGLE',
            subject: data.subject,
          },
          select: { id: true },
        });

        if (existingExternalIdentity) {
          return;
        }

        const existingUser = await transaction.user.findUnique({
          where: { email: data.email },
          select: { id: true },
        });

        // Never auto-link an existing global account by matching email.
        if (existingUser) {
          return;
        }

        const user = await transaction.user.create({
          data: {
            email: data.email,
            phone: data.phone,
            passwordHash: null,
            firstName: data.firstName,
            lastName: data.lastName,
            status: 'PENDING_VERIFICATION',
          },
          select: { id: true },
        });

        await transaction.externalAuthIdentity.create({
          data: {
            userId: user.id,
            provider: 'GOOGLE',
            subject: data.subject,
            email: data.email,
            emailVerified: true,
          },
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
      // Concurrent email/Google-subject races must remain indistinguishable
      // through the public registration response.
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
