import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { BRAND } from '@medsphere/brand';
import { hasPrismaCode, withSerializableRetry, type Prisma } from '@medsphere/database';
import { AuditWriter } from '../audit/audit-writer.service';
import type { AuthenticatedIdentity, RequestMetadata } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { OrganizationType } from './organization-type';
import {
  generateJoinCode,
  hashJoinCode,
  isValidJoinCodeFormat,
  normalizeJoinCode,
} from './organization-join-code.util';

type OrgTransaction = Prisma.TransactionClient;

/**
 * The single, well-known personal-account tenant every `organizationType:
 * 'NONE'` registration becomes a member of. Chosen as the smallest
 * architecture-compatible model for a personal/patient account: the
 * existing tenant-isolation architecture requires every User to reach
 * the system through a TenantMembership, so a personal account is
 * modeled as an ACTIVE, role-less membership in one dedicated,
 * non-healthcare tenant -- never a healthcare-organization membership,
 * never a bypass of TenantMembership/tenant-scoped authorization at all.
 * See the accompanying ADR for the alternatives considered.
 */
const PERSONAL_ACCOUNTS_TENANT_SLUG = 'medsphere-personal-accounts';
const PERSONAL_ACCOUNTS_TENANT_NAME = `${BRAND.fullName} Personal Accounts`;

export interface PasswordOrganizationRegistrationInput {
  readonly organizationType: OrganizationType;
  readonly organizationCode?: string;
  readonly email: string;
  readonly phone: string;
  readonly passwordHash: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly orgJoinCodePepper: Buffer;
}

export interface GoogleOrganizationRegistrationInput {
  readonly organizationType: OrganizationType;
  readonly organizationCode?: string;
  readonly subject: string;
  readonly email: string;
  readonly phone: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly orgJoinCodePepper: Buffer;
}

type TenantResolution =
  | { readonly ok: true; readonly tenantId: string; readonly joinCodeId: string | null }
  | { readonly ok: false };

@Injectable()
export class OrganizationOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async listJoinCodes(identity: AuthenticatedIdentity) {
    return this.prisma.client.organizationJoinCode.findMany({
      where: { tenantId: identity.tenantId, deletedAt: null },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        revokedAt: true,
        redemptionCount: true,
        version: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async issueJoinCode(
    identity: AuthenticatedIdentity,
    expiresAt: Date | null,
    pepper: Buffer,
    request: RequestMetadata,
  ) {
    const code = generateJoinCode();
    const codeHash = hashJoinCode(pepper, normalizeJoinCode(code));
    const created = await withSerializableRetry(this.prisma.client, async (transaction) => {
      const tenant = await transaction.tenant.findFirst({
        where: {
          id: identity.tenantId,
          isActive: true,
          deletedAt: null,
          organizationType: {
            in: ['PHARMACY', 'HOSPITAL', 'LABORATORY', 'CLINIC', 'BLOOD_BANK', 'SUPPLIER'],
          },
        },
        select: { id: true },
      });
      if (!tenant) {
        throw new BadRequestException('Organization is not eligible to issue join codes');
      }
      const row = await transaction.organizationJoinCode.create({
        data: {
          tenantId: identity.tenantId,
          createdByMembershipId: identity.membershipId,
          codeHash,
          expiresAt,
        },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          redemptionCount: true,
          version: true,
          createdAt: true,
        },
      });
      await this.audit.appendTenantUser(transaction, {
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        eventType: 'authentication.organization.join.code.issued',
        outcome: 'SUCCEEDED',
        resourceType: 'OrganizationJoinCode',
        resourceId: row.id,
        request,
        metadata: { expires: expiresAt !== null },
      });
      return row;
    });

    // The plaintext is returned exactly once and is never persisted.
    return { ...created, code };
  }

  async revokeJoinCode(
    identity: AuthenticatedIdentity,
    joinCodeId: string,
    requiredVersion: number,
    request: RequestMetadata,
  ): Promise<void> {
    await withSerializableRetry(this.prisma.client, async (transaction) => {
      const revokedAt = new Date();
      const result = await transaction.organizationJoinCode.updateMany({
        where: {
          id: joinCodeId,
          tenantId: identity.tenantId,
          deletedAt: null,
          status: 'ACTIVE',
          version: requiredVersion,
        },
        data: { status: 'REVOKED', revokedAt, version: { increment: 1 } },
      });
      if (result.count !== 1) {
        const existing = await transaction.organizationJoinCode.findFirst({
          where: { id: joinCodeId, tenantId: identity.tenantId, deletedAt: null },
          select: { version: true, status: true },
        });
        if (!existing) throw new NotFoundException('Organization join code not found');
        throw new PreconditionFailedException('Organization join code version is stale');
      }
      await this.audit.appendTenantUser(transaction, {
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        eventType: 'authentication.organization.join.code.revoked',
        outcome: 'SUCCEEDED',
        resourceType: 'OrganizationJoinCode',
        resourceId: joinCodeId,
        request,
        metadata: { previousVersion: requiredVersion },
      });
    });
  }

  /**
   * Mirrors UsersRepository.createPendingRegistration's accepted shape
   * and anti-enumeration behavior exactly (identical outward response
   * whether the organization code is invalid, the organization does not
   * exist, the type does not match, or the email is already taken) --
   * only the tenant-resolution step (organization type + code instead of
   * a user-supplied tenant slug) is new.
   */
  async registerWithPassword(input: PasswordOrganizationRegistrationInput): Promise<void> {
    try {
      await withSerializableRetry(this.prisma.client, async (transaction) => {
        const existingUser = await transaction.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });
        if (existingUser) {
          return;
        }

        const resolution = await this.resolveTenant(
          transaction,
          input.organizationType,
          input.organizationCode,
          input.orgJoinCodePepper,
        );
        if (!resolution.ok) {
          return;
        }

        const user = await transaction.user.create({
          data: {
            email: input.email,
            phone: input.phone,
            passwordHash: input.passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            status: 'PENDING_VERIFICATION',
          },
          select: { id: true },
        });

        await this.createMembershipAndAudit(
          transaction,
          resolution,
          user.id,
          input.organizationType,
        );
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        return;
      }
      throw error;
    }
  }

  /**
   * Mirrors UsersRepository.createPendingGoogleRegistration's accepted
   * shape exactly, including never auto-linking an existing global user
   * or Google subject to another tenant.
   */
  async registerWithGoogle(input: GoogleOrganizationRegistrationInput): Promise<void> {
    try {
      await withSerializableRetry(this.prisma.client, async (transaction) => {
        const existingExternalIdentity = await transaction.externalAuthIdentity.findFirst({
          where: { provider: 'GOOGLE', subject: input.subject },
          select: { id: true },
        });
        if (existingExternalIdentity) {
          return;
        }

        const existingUser = await transaction.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });
        if (existingUser) {
          return;
        }

        const resolution = await this.resolveTenant(
          transaction,
          input.organizationType,
          input.organizationCode,
          input.orgJoinCodePepper,
        );
        if (!resolution.ok) {
          return;
        }

        const user = await transaction.user.create({
          data: {
            email: input.email,
            phone: input.phone,
            passwordHash: null,
            firstName: input.firstName,
            lastName: input.lastName,
            status: 'PENDING_VERIFICATION',
          },
          select: { id: true },
        });

        await transaction.externalAuthIdentity.create({
          data: {
            userId: user.id,
            provider: 'GOOGLE',
            subject: input.subject,
            email: input.email,
            emailVerified: true,
          },
        });

        await this.createMembershipAndAudit(
          transaction,
          resolution,
          user.id,
          input.organizationType,
        );
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        return;
      }
      throw error;
    }
  }

  private async createMembershipAndAudit(
    transaction: OrgTransaction,
    resolution: Extract<TenantResolution, { ok: true }>,
    userId: string,
    organizationType: OrganizationType,
  ): Promise<void> {
    // Personal accounts (NONE) are activated immediately: there is no
    // healthcare permission, provider access, or privileged role to
    // gate behind phone/identity/age verification for a non-healthcare
    // context -- see the ADR. Every other organization type creates a
    // PENDING membership, exactly matching the pre-existing accepted
    // safety property, and is never auto-activated here.
    const membership = await transaction.tenantMembership.create({
      data: {
        tenantId: resolution.tenantId,
        userId,
        status: organizationType === 'NONE' ? 'ACTIVE' : 'PENDING',
        joinedAt: organizationType === 'NONE' ? new Date() : null,
      },
      select: { id: true },
    });

    if (resolution.joinCodeId) {
      await transaction.organizationJoinCode.update({
        where: { id: resolution.joinCodeId },
        data: { redemptionCount: { increment: 1 } },
      });
    }

    await this.audit.appendTenantSystem(transaction, {
      tenantId: resolution.tenantId,
      eventType: 'authentication.organization.join.requested',
      outcome: 'SUCCEEDED',
      resourceType: 'TenantMembership',
      resourceId: membership.id,
      // Never the raw code, the organization name, or any identifying
      // value -- only the bounded, non-sensitive organization type.
      metadata: { organizationType },
    });
  }

  /**
   * Resolves the target tenant for a registration request. Returns
   * `{ ok: false }` for every failure mode (malformed code, invalid
   * code, expired, revoked, organization inactive, or organization-type
   * mismatch) -- callers must treat every one of these identically
   * (silent no-op, same outward response as an unknown email) so an
   * unauthenticated caller can never distinguish "no such organization"
   * from "wrong code" from "wrong type" from "expired".
   */
  private async resolveTenant(
    transaction: OrgTransaction,
    organizationType: OrganizationType,
    organizationCode: string | undefined,
    orgJoinCodePepper: Buffer,
  ): Promise<TenantResolution> {
    if (organizationType === 'NONE') {
      const tenantId = await this.ensurePersonalAccountsTenant(transaction);
      return { ok: true, tenantId, joinCodeId: null };
    }

    if (!organizationCode) {
      return { ok: false };
    }
    const normalized = normalizeJoinCode(organizationCode);
    if (!isValidJoinCodeFormat(normalized)) {
      return { ok: false };
    }

    const codeHash = hashJoinCode(orgJoinCodePepper, normalized);
    const joinCode = await transaction.organizationJoinCode.findUnique({
      where: { codeHash },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        deletedAt: true,
        tenant: {
          select: {
            id: true,
            isActive: true,
            deletedAt: true,
            organizationType: true,
          },
        },
      },
    });

    const now = new Date();
    const codeValid =
      joinCode !== null &&
      joinCode.deletedAt === null &&
      joinCode.status === 'ACTIVE' &&
      (joinCode.expiresAt === null || joinCode.expiresAt.getTime() > now.getTime()) &&
      joinCode.tenant.deletedAt === null &&
      joinCode.tenant.isActive === true &&
      // Never trust organization type from the client alone: the
      // selected type must match the organization's actual,
      // server-recorded type exactly.
      joinCode.tenant.organizationType === organizationType;

    if (!codeValid) {
      // Audited (bounded, non-identifying reason only) even though the
      // outward registration response stays identical to every other
      // failure mode -- see resourceType note below.
      await this.audit.appendSystem(transaction, {
        eventType: 'authentication.organization.join.code.rejected',
        outcome: 'DENIED',
        metadata: { reason: joinCode ? 'invalid_or_expired_or_type_mismatch' : 'code_not_found' },
      });
      return { ok: false };
    }

    return { ok: true, tenantId: joinCode.tenant.id, joinCodeId: joinCode.id };
  }

  private async ensurePersonalAccountsTenant(transaction: OrgTransaction): Promise<string> {
    // Prisma emits a native atomic upsert for this unique selector. That
    // avoids catching a uniqueness violation inside PostgreSQL, where the
    // transaction would already be aborted and could not safely re-read.
    const tenant = await transaction.tenant.upsert({
      where: { slug: PERSONAL_ACCOUNTS_TENANT_SLUG },
      update: {},
      create: {
        name: PERSONAL_ACCOUNTS_TENANT_NAME,
        slug: PERSONAL_ACCOUNTS_TENANT_SLUG,
        organizationType: 'NONE',
        isActive: true,
        selfRegistrationEnabled: false,
      },
      select: {
        id: true,
        organizationType: true,
        isActive: true,
        selfRegistrationEnabled: true,
        deletedAt: true,
      },
    });

    // A pre-existing row with the reserved slug must never be silently
    // repurposed as the shared personal-account boundary.
    if (
      tenant.organizationType !== 'NONE' ||
      !tenant.isActive ||
      tenant.selfRegistrationEnabled ||
      tenant.deletedAt !== null
    ) {
      throw new Error('Reserved personal-account tenant is misconfigured');
    }

    return tenant.id;
  }
}
