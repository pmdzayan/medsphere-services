import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Candidate Task 0039 (PROVISIONAL). See
 * docs/candidates/0039-pharmacy-onboarding-verification-provisional.md
 *
 * Central, authoritative answer to "is this Provider currently eligible
 * as a verified pharmacy" -- evaluated fresh against durable state at
 * call time, never relying solely on `Provider.isVerified` being
 * up to date. `Provider.isVerified` may still be maintained as a
 * transactionally-updated projection (a useful fast filter for list
 * queries), but this evaluator is the single source of truth Task 0026
 * and any other eligibility-sensitive call site must use, because a
 * projection can go stale between an authoritative expiry and the next
 * time a background worker runs -- this evaluator checks license
 * validity AT EVALUATION TIME, not at the time the projection was last
 * written, so eligibility fails closed immediately upon expiry with no
 * dependency on worker timing.
 *
 * FAIL-CLOSED CONTRACT: every branch below that cannot prove
 * eligibility returns `eligible: false` with a specific reason. There
 * is no code path that defaults to `true` on an unexpected or
 * ambiguous state.
 */

export type PharmacyIneligibilityReason =
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_NOT_PHARMACY'
  | 'PROVIDER_DELETED'
  | 'PROVIDER_INACTIVE'
  | 'NO_CURRENT_VERIFICATION'
  | 'CURRENT_VERIFICATION_WRONG_OWNER'
  | 'CURRENT_VERIFICATION_NOT_APPROVED'
  | 'LICENSE_EXPIRED';

export type PharmacyEligibilityResult =
  | { readonly eligible: false; readonly reason: PharmacyIneligibilityReason }
  | { readonly eligible: true };

export interface EvaluatePharmacyEligibilityInput {
  readonly tenantId: string;
  readonly providerId: string;
  readonly now?: Date;
}

@Injectable()
export class PharmacyVerificationEligibilityEvaluator {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates pharmacy verification eligibility fresh, in one read
   * pass. Order of checks matters only for which reason is reported
   * first -- every condition is independently fail-closed regardless
   * of ordering.
   */
  async evaluate(input: EvaluatePharmacyEligibilityInput): Promise<PharmacyEligibilityResult> {
    const now = input.now ?? new Date();

    const provider = await this.prisma.client.provider.findFirst({
      where: { id: input.providerId, tenantId: input.tenantId },
      select: {
        providerType: true,
        isActive: true,
        deletedAt: true,
      },
    });
    if (!provider) {
      return { eligible: false, reason: 'PROVIDER_NOT_FOUND' };
    }
    if (provider.deletedAt !== null) {
      // Checked before providerType/isActive so a deleted provider is
      // never reported as merely "wrong type" or "inactive" -- deletion
      // is the most fundamental disqualifier.
      return { eligible: false, reason: 'PROVIDER_DELETED' };
    }
    if (provider.providerType !== 'PHARMACY') {
      return { eligible: false, reason: 'PROVIDER_NOT_PHARMACY' };
    }
    if (!provider.isActive) {
      return { eligible: false, reason: 'PROVIDER_INACTIVE' };
    }

    // Deterministic current-verification lookup: `isCurrent = true` is
    // enforced to be at most one row per providerId by a partial
    // unique index (see the migration) -- this can never be ambiguous.
    // A row that is `isCurrent` but was somehow created for a
    // different (tenantId, providerId) pair than requested is treated
    // as absent, not as a match -- this is a defense-in-depth check;
    // the composite FK already makes true cross-tenant attachment
    // impossible, but this guards against a caller passing the wrong
    // tenantId/providerId pair for an unrelated provider that happens
    // to share an id collision across tenants (which cannot happen
    // given UUIDs, but the check costs nothing and documents the
    // invariant explicitly).
    const currentVerification = await this.prisma.client.providerVerification.findFirst({
      where: {
        providerId: input.providerId,
        tenantId: input.tenantId,
        isCurrent: true,
      },
      select: {
        providerId: true,
        tenantId: true,
        status: true,
        licenseExpiryDate: true,
      },
    });
    if (!currentVerification) {
      return { eligible: false, reason: 'NO_CURRENT_VERIFICATION' };
    }
    if (
      currentVerification.providerId !== input.providerId ||
      currentVerification.tenantId !== input.tenantId
    ) {
      return { eligible: false, reason: 'CURRENT_VERIFICATION_WRONG_OWNER' };
    }
    if (currentVerification.status !== 'APPROVED') {
      // Covers PENDING, UNDER_REVIEW, REJECTED, SUSPENDED, EXPIRED --
      // an old historical APPROVED row can never override this, because
      // this query only ever looks at the SINGLE row marked
      // `isCurrent = true` (a newer suspension/rejection/expiry
      // transition always moves `isCurrent` off the old APPROVED row
      // atomically -- see `ProviderVerificationService`).
      return { eligible: false, reason: 'CURRENT_VERIFICATION_NOT_APPROVED' };
    }
    if (currentVerification.licenseExpiryDate.getTime() <= now.getTime()) {
      // Evaluated fresh at call time -- an approved-but-now-expired
      // license fails immediately, with no dependency on a background
      // expiry worker having already flipped the row's status.
      return { eligible: false, reason: 'LICENSE_EXPIRED' };
    }

    return { eligible: true };
  }
}
