import { createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { withSerializableRetry } from '@medsphere/database';
import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteMockVerificationDto } from './dto/complete-mock-verification.dto';
import type { VerificationCompletionResult } from './verification.types';

@Injectable()
export class AccountVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async completeMockVerification(
    input: CompleteMockVerificationDto,
  ): Promise<VerificationCompletionResult> {
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.ENABLE_TEST_VERIFICATION_PROVIDER !== 'true'
    ) {
      throw new NotFoundException('Verification route not found');
    }
    if (
      input.method === 'AGE' &&
      input.approved &&
      input.ageVerified18Plus === undefined
    ) {
      throw new ConflictException('Successful age verification requires an adult-age decision');
    }

    const commandHash = createHash('sha256')
      .update(
        JSON.stringify({
          method: input.method,
          approved: input.approved,
          ageVerified18Plus: input.ageVerified18Plus ?? null,
          providerReference: input.providerReference ?? null,
        }),
      )
      .digest('hex');

    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const membership = await transaction.tenantMembership.findFirst({
        where: {
          deletedAt: null,
          tenant: { slug: input.tenantSlug, isActive: true, deletedAt: null },
          user: { email: input.email, deletedAt: null },
        },
        select: {
          id: true,
          tenantId: true,
          status: true,
          user: {
            select: {
              id: true,
              status: true,
              phoneVerifiedAt: true,
              identityVerificationStatus: true,
              ageVerificationStatus: true,
              ageVerified18Plus: true,
            },
          },
        },
      });
      if (!membership) {
        throw new NotFoundException('Pending verification subject not found');
      }

      const existing = await transaction.accountVerificationAttempt.findFirst({
        where: {
          userId: membership.user.id,
          provider: 'MOCK',
          method: input.method,
          idempotencyKey: input.idempotencyKey,
        },
        select: { commandHash: true },
      });
      if (existing && existing.commandHash !== commandHash) {
        throw new ConflictException('Verification idempotency key conflict');
      }
      if (existing) {
        return {
          userId: membership.user.id,
          membershipId: membership.id,
          userStatus: membership.user.status,
          membershipStatus: membership.status,
          activated:
            membership.user.status === 'ACTIVE' && membership.status === 'ACTIVE',
          replayed: true,
        };
      }

      const status = input.approved ? ('APPROVED' as const) : ('REJECTED' as const);
      await transaction.accountVerificationAttempt.create({
        data: {
          userId: membership.user.id,
          method: input.method,
          provider: 'MOCK',
          status,
          providerReference: input.providerReference,
          idempotencyKey: input.idempotencyKey,
          commandHash,
          verifiedAt: input.approved ? new Date() : null,
        },
        select: { id: true },
      });

      const userPatch =
        input.method === 'PHONE'
          ? input.approved
            ? { phoneVerifiedAt: new Date() }
            : {}
          : input.method === 'IDENTITY'
            ? { identityVerificationStatus: status }
            : {
                ageVerificationStatus: status,
                ageVerified18Plus: input.approved ? input.ageVerified18Plus === true : false,
              };

      const user = await transaction.user.update({
        where: { id: membership.user.id },
        data: userPatch,
        select: {
          id: true,
          status: true,
          phoneVerifiedAt: true,
          identityVerificationStatus: true,
          ageVerificationStatus: true,
          ageVerified18Plus: true,
        },
      });

      await this.audit.appendTenantSystem(transaction, {
        tenantId: membership.tenantId,
        eventType: 'authentication.verification.completed',
        outcome: input.approved ? 'SUCCEEDED' : 'DENIED',
        resourceType: 'User',
        resourceId: user.id,
        metadata: {
          method: input.method,
          provider: 'MOCK',
          status,
          age18Plus: input.method === 'AGE' ? input.ageVerified18Plus ?? false : null,
        },
      });

      const eligible =
        user.phoneVerifiedAt !== null &&
        user.identityVerificationStatus === 'APPROVED' &&
        user.ageVerificationStatus === 'APPROVED' &&
        user.ageVerified18Plus === true;

      if (!eligible) {
        return {
          userId: user.id,
          membershipId: membership.id,
          userStatus: user.status,
          membershipStatus: membership.status,
          activated: false,
          replayed: false,
        };
      }

      if (membership.status !== 'PENDING' && membership.status !== 'ACTIVE') {
        throw new ServiceUnavailableException('Membership cannot be activated from its current state');
      }

      const activatedUser =
        user.status === 'ACTIVE'
          ? user
          : await transaction.user.update({
              where: { id: user.id },
              data: { status: 'ACTIVE' },
              select: {
                id: true,
                status: true,
                phoneVerifiedAt: true,
                identityVerificationStatus: true,
                ageVerificationStatus: true,
                ageVerified18Plus: true,
              },
            });

      const activatedMembership =
        membership.status === 'ACTIVE'
          ? membership
          : await transaction.tenantMembership.update({
              where: { id: membership.id },
              data: { status: 'ACTIVE', joinedAt: new Date() },
              select: {
                id: true,
                tenantId: true,
                status: true,
                user: { select: { id: true } },
              },
            });

      await this.audit.appendTenantSystem(transaction, {
        tenantId: membership.tenantId,
        eventType: 'authentication.account.activated',
        outcome: 'SUCCEEDED',
        resourceType: 'TenantMembership',
        resourceId: membership.id,
        metadata: { verificationPolicy: 'PHONE_IDENTITY_ADULT_18_PLUS' },
      });

      return {
        userId: activatedUser.id,
        membershipId: activatedMembership.id,
        userStatus: activatedUser.status,
        membershipStatus: activatedMembership.status,
        activated: true,
        replayed: false,
      };
    });
  }
}
