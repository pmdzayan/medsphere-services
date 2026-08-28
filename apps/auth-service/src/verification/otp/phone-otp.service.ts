import { BadRequestException, Injectable } from '@nestjs/common';
import { withSerializableRetry, type Prisma } from '@medsphere/database';
import { AuditWriter } from '../../audit/audit-writer.service';
import { AuthConfigService } from '../../auth/auth-config.service';
import { normalizeAuthenticationLocator } from '../../auth/auth-normalization';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountVerificationService } from '../account-verification.service';
import type { VerificationCompletionResult } from '../verification.types';
import {
  MAX_OTP_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
} from './otp-crypto.util';
import { isValidE164PhoneNumber, normalizePhoneNumber } from './phone-normalization';
import {
  ContractSmsProviderRegistry,
  SmsProviderContractFailure,
} from './sms-provider-activation.contracts';

type OtpTransaction = Prisma.TransactionClient;

export interface RequestPhoneOtpInput {
  readonly tenantSlug?: string;
  readonly email: string;
}

export interface VerifyPhoneOtpInput {
  readonly tenantSlug?: string;
  readonly email: string;
  readonly code: string;
}

export interface RequestPhoneOtpResult {
  /** Always the same generic message, whether or not the account/tenant is eligible. */
  readonly message: string;
}

export interface VerifyPhoneOtpResult extends VerificationCompletionResult {
  readonly replayed: boolean;
}

/**
 * Orchestrates real phone OTP request/verification. Does not implement its
 * own account-activation policy: on successful verification it delegates
 * to AccountVerificationService.applyPhoneVerified, the exact same
 * accepted eligibility check every other verification method already
 * uses. See ADR-023.
 */
@Injectable()
export class PhoneOtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly authConfig: AuthConfigService,
    private readonly accountVerification: AccountVerificationService,
    private readonly smsProviderRegistry: ContractSmsProviderRegistry,
  ) {}

  async requestOtp(input: RequestPhoneOtpInput): Promise<RequestPhoneOtpResult> {
    const tenantSlug = input.tenantSlug
      ? normalizeAuthenticationLocator(input.tenantSlug)
      : undefined;
    const email = normalizeAuthenticationLocator(input.email);
    const genericResult: RequestPhoneOtpResult = {
      message: 'If eligible, a verification code has been sent.',
    };

    const dispatch = await withSerializableRetry(this.prisma.client, async (transaction) => {
      const membership = await this.findEligibleMembership(transaction, tenantSlug, email);
      if (!membership) {
        // Non-enumerating: identical outward response either way.
        return null;
      }

      // Security boundary: the SMS destination comes only from the phone
      // bound to the user during registration. A public OTP request can
      // never redirect another user's code to a caller-selected number.
      if (!membership.user.phone) {
        return null;
      }

      const phone = normalizePhoneNumber(membership.user.phone);
      if (!isValidE164PhoneNumber(phone)) {
        return null;
      }

      const existing = await transaction.phoneOtpChallenge.findUnique({
        where: { tenantId_userId: { tenantId: membership.tenantId, userId: membership.user.id } },
        select: { lastRequestedAt: true },
      });
      if (existing && Date.now() - existing.lastRequestedAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
        // Cooldown still active: no-op, same generic response. The
        // frontend enforces the cooldown UX with its own local timer
        // rather than relying on a server-echoed countdown, so this
        // branch stays as non-enumerating as the happy path.
        return null;
      }

      const code = generateOtpCode();
      const codeHash = hashOtpCode(this.authConfig.value.otpPepper, code);
      const now = new Date();

      await transaction.phoneOtpChallenge.upsert({
        where: { tenantId_userId: { tenantId: membership.tenantId, userId: membership.user.id } },
        create: {
          tenantId: membership.tenantId,
          userId: membership.user.id,
          phone,
          codeHash,
          attempts: 0,
          expiresAt: new Date(now.getTime() + OTP_TTL_MS),
          lastRequestedAt: now,
        },
        update: {
          phone,
          codeHash,
          attempts: 0,
          consumedAt: null,
          expiresAt: new Date(now.getTime() + OTP_TTL_MS),
          lastRequestedAt: now,
        },
      });

      await this.audit.appendTenantSystem(transaction, {
        tenantId: membership.tenantId,
        eventType: 'authentication.otp.requested',
        outcome: 'SUCCEEDED',
        resourceType: 'User',
        resourceId: membership.user.id,
        metadata: {},
      });

      return { tenantId: membership.tenantId, userId: membership.user.id, phone, code };
    });

    if (!dispatch) {
      return genericResult;
    }

    // Dispatch happens outside the DB transaction: an external network
    // call must not hold a SERIALIZABLE transaction/connection open. If
    // dispatch fails, the persisted challenge is invalidated so the user
    // is never blocked by the resend cooldown for a code they never
    // received.
    try {
      const provider = this.smsProviderRegistry.provider();
      await provider.deliver({
        to: dispatch.phone,
        body: `Your MedSphere verification code is ${dispatch.code}. It expires in 10 minutes.`,
        otpCode: dispatch.code,
      });
    } catch (error) {
      await this.invalidateChallenge(dispatch.tenantId, dispatch.userId);
      if (error instanceof SmsProviderContractFailure) {
        throw new BadRequestException('Verification code delivery is temporarily unavailable');
      }
      throw error;
    }

    return genericResult;
  }

  async verifyOtp(input: VerifyPhoneOtpInput): Promise<VerifyPhoneOtpResult> {
    const tenantSlug = input.tenantSlug
      ? normalizeAuthenticationLocator(input.tenantSlug)
      : undefined;
    const email = normalizeAuthenticationLocator(input.email);
    const code = input.code.trim();

    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const membership = await this.findEligibleMembership(transaction, tenantSlug, email);
      if (!membership) {
        throw new BadRequestException('Invalid or expired verification code');
      }

      const challenge = await transaction.phoneOtpChallenge.findUnique({
        where: { tenantId_userId: { tenantId: membership.tenantId, userId: membership.user.id } },
      });
      if (!challenge) {
        throw new BadRequestException('Invalid or expired verification code');
      }

      if (challenge.consumedAt !== null) {
        // Idempotent replay: only a resubmission of the *same* code that
        // already succeeded returns success again. A different code
        // against an already-consumed challenge is always rejected.
        if (!verifyOtpCode(this.authConfig.value.otpPepper, code, challenge.codeHash)) {
          throw new BadRequestException('Invalid or expired verification code');
        }
        const replayedOutcome = await this.accountVerification.applyPhoneVerified(transaction, {
          tenantId: membership.tenantId,
          userId: membership.user.id,
        });
        return { ...replayedOutcome, replayed: true };
      }

      if (challenge.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException('Verification code has expired, request a new one');
      }

      if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
        throw new BadRequestException('Too many attempts, request a new verification code');
      }

      const matches = verifyOtpCode(this.authConfig.value.otpPepper, code, challenge.codeHash);
      if (!matches) {
        await transaction.phoneOtpChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
        await this.audit.appendTenantSystem(transaction, {
          tenantId: membership.tenantId,
          eventType: 'authentication.verification.completed',
          outcome: 'DENIED',
          resourceType: 'User',
          resourceId: membership.user.id,
          metadata: { method: 'PHONE', provider: 'SMS_OTP', status: 'REJECTED', age18Plus: null },
        });
        throw new BadRequestException('Invalid verification code');
      }

      await transaction.phoneOtpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });

      await this.audit.appendTenantSystem(transaction, {
        tenantId: membership.tenantId,
        eventType: 'authentication.verification.completed',
        outcome: 'SUCCEEDED',
        resourceType: 'User',
        resourceId: membership.user.id,
        metadata: { method: 'PHONE', provider: 'SMS_OTP', status: 'APPROVED', age18Plus: null },
      });

      const outcome = await this.accountVerification.applyPhoneVerified(transaction, {
        tenantId: membership.tenantId,
        userId: membership.user.id,
      });
      return { ...outcome, replayed: false };
    });
  }

  private async findEligibleMembership(
    transaction: OtpTransaction,
    tenantSlug: string | undefined,
    email: string,
  ) {
    const where = {
      deletedAt: null,
      status: { in: ['PENDING', 'ACTIVE'] },
      tenant: {
        ...(tenantSlug ? { slug: tenantSlug } : {}),
        isActive: true,
        deletedAt: null,
      },
      user: { email, deletedAt: null },
    } satisfies Prisma.TenantMembershipWhereInput;
    const select = {
      id: true,
      tenantId: true,
      status: true,
      user: { select: { id: true, phone: true } },
    } satisfies Prisma.TenantMembershipSelect;

    if (tenantSlug) {
      return transaction.tenantMembership.findFirst({ where, select });
    }

    // New onboarding never asks a person to know an internal slug. Resolve
    // only when the email has one eligible membership; ambiguity fails
    // closed and produces the same generic public response.
    const memberships = await transaction.tenantMembership.findMany({
      where,
      select,
      take: 2,
    });
    return memberships.length === 1 ? memberships[0] : null;
  }

  private async invalidateChallenge(tenantId: string, userId: string): Promise<void> {
    await this.prisma.client.phoneOtpChallenge.updateMany({
      where: { tenantId, userId },
      data: { expiresAt: new Date(0) },
    });
  }
}
