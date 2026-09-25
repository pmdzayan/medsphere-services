import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditWriter } from '../audit/audit-writer.service';
import { PlatformRepository } from '../platform/platform.repository';
import { PLATFORM_PERMISSIONS } from '../platform/platform.constants';
import { requireActiveTenantActorWithProvider } from '@medsphere/security';
import type { TrustedTenantActor } from '@medsphere/security';
import type { AuditEventType, Prisma } from '@medsphere/database';

/**
 * Candidate Task 0039 (PROVISIONAL). See
 * docs/candidates/0039-pharmacy-onboarding-verification-provisional.md
 *
 * RECONCILED onto the accepted Task 0027/0028 base (PRs #147, #148).
 *
 * MODEL: `isCurrent` means "the record currently AUTHORITATIVE for
 * eligibility/state" -- NOT "the most recent submission". A valid
 * APPROVED+current verification remains authoritative even while a
 * renewal submission exists as an open PENDING/UNDER_REVIEW row with
 * isCurrent=false for the SAME provider.
 *
 * CORRECTION (CTO review, post-0028 reconciliation, item 1): a
 * SUSPENDED current verification is NOT resubmittable by tenant staff
 * -- a platform suspension is a consequential decision that a tenant
 * must never be able to clear, replace, or bypass merely by
 * submitting new evidence. Only REJECTED, EXPIRED, or "no current
 * state" may be superseded by a fresh tenant submission; a valid
 * APPROVED state may receive a non-current renewal. SUSPENDED blocks
 * `submitVerification` entirely until an accepted, explicit platform
 * workflow first removes/replaces the suspension -- this candidate
 * does not invent automatic unsuspension.
 *
 * CORRECTION (CTO review, post-0028 reconciliation, item 2): every
 * consequential transition for one provider (submit/resubmit,
 * beginReview, approve, reject, suspend) now serializes against the
 * SAME provider-level PostgreSQL advisory lock Task 0027 already
 * established for its own provider-scoped admission decisions
 * (`pg_advisory_xact_lock(hashtext(tenantId), hashtext(providerId))`)
 * -- reusing the one accepted serialization primitive, not inventing a
 * second one. The lock is acquired FIRST, before any read of
 * authoritative state; every decision is then made from a RE-READ of
 * that state taken after the lock, never from a read taken before it.
 * This closes the exact race the CTO review identified: a concurrent
 * renewal-approval's multi-row demote/promote can no longer interleave
 * with a suspend's (or any other consequential transition's) read of
 * "is this row still current".
 *
 * VERIFICATION != AUTHORIZATION: nothing here ever creates, modifies,
 * or reads tenant membership, staff accounts, roles, or permissions.
 */

export type ProviderVerificationConflictReason =
  | 'OPEN_SUBMISSION_ALREADY_EXISTS'
  | 'STALE_VERSION'
  | 'NOT_IN_ALLOWED_STATE'
  | 'CURRENT_VERIFICATION_SUSPENDED';

export class ProviderVerificationConflictError extends ConflictException {
  constructor(public readonly reason: ProviderVerificationConflictReason) {
    super(`Provider verification conflict: ${reason}`);
  }
}

export interface SubmitVerificationInput {
  readonly actor: TrustedTenantActor;
  readonly providerId: string;
  readonly licenseNumber: string;
  readonly licenseExpiryDate: Date;
  readonly businessRegistrationNumber?: string;
  readonly governmentIdReference: string;
  readonly now?: Date;
}

/**
 * CORRECTION (item 5): the controller guards (`PlatformAuthGuard` +
 * `PlatformPermissionsGuard`) already verify the reviewer live from
 * the database on every request. `platformAccountId` is required here
 * so every consequential mutation can ADDITIONALLY re-verify,
 * immediately before the serialized transaction, that the account is
 * still ACTIVE and still actually holds
 * `platform.provider-verifications.review` via the SAME accepted
 * live, DB-backed `PlatformRepository.findEffectivePlatformPermissions`
 * primitive the guard itself uses. This check currently happens
 * immediately before the transaction begins (that accepted primitive
 * is not transaction-client-aware, so it cannot be moved fully inside
 * the same transaction without modifying shared platform
 * infrastructure, which is out of scope for this provisional
 * candidate) -- documented explicitly here rather than left implicit.
 */
export interface ReviewerActor {
  readonly platformUserId: string;
  readonly platformAccountId: string;
}

export interface ReviewActionInput {
  readonly reviewerActor: ReviewerActor;
  readonly verificationId: string;
  readonly expectedVersion: number;
  readonly now?: Date;
}

export interface RejectActionInput extends ReviewActionInput {
  readonly applicantMessage?: string;
  readonly verificationNotes?: string;
}

export interface SuspendActionInput extends ReviewActionInput {
  readonly verificationNotes?: string;
}

const OPEN_STATUSES = new Set(['PENDING', 'UNDER_REVIEW']);
const VERIFIABLE_PROVIDER_TYPES = new Set([
  'PHARMACY',
  'HOSPITAL',
  'CLINIC',
  'LABORATORY',
  'DOCTOR',
]);

type VerificationAuditAction =
  | 'submitted'
  | 'resubmitted'
  | 'review-started'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'expired';

function verificationAuditEvent(
  providerType: string,
  action: VerificationAuditAction,
): AuditEventType {
  const domain = providerType === 'PHARMACY' ? 'pharmacy' : 'provider';
  return `${domain}.verification.${action}` as AuditEventType;
}

@Injectable()
export class ProviderVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly platformRepository: PlatformRepository,
  ) {}

  private async assertReviewerStillAuthorized(reviewerActor: ReviewerActor): Promise<void> {
    const permissions = await this.platformRepository.findEffectivePlatformPermissions(
      reviewerActor.platformAccountId,
    );
    if (!permissions.includes(PLATFORM_PERMISSIONS.providerVerificationsReview)) {
      throw new ForbiddenException('Platform reviewer is no longer authorized');
    }
  }

  /**
   * Acquires the Task-0027-pattern provider-scoped advisory lock,
   * serializing this transaction against every other consequential
   * verification transition (and Task 0027's own admission decisions)
   * for the SAME (tenantId, providerId). MUST be called before any
   * read of authoritative verification state within the transaction
   * -- every subsequent read in the same transaction is guaranteed
   * fresh relative to any other transaction that also takes this
   * lock.
   */
  private async acquireProviderLock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    providerId: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT 1::int AS "locked"
      FROM pg_advisory_xact_lock(
        hashtext(${tenantId}::text),
        hashtext(${providerId}::text)
      )
    `;
  }

  /**
   * Submits (or resubmits/renews) pharmacy verification evidence.
   *
   * Resubmission policy (CORRECTED, item 1):
   * - no current state -> submit (becomes current, PENDING)
   * - REJECTED / EXPIRED current -> resubmit (new row becomes current)
   * - valid, unexpired APPROVED current -> submit a RENEWAL (new row
   *   is open but NOT current; the existing approval remains
   *   authoritative)
   * - SUSPENDED current -> BLOCKED. A tenant can never clear, replace,
   *   or bypass a platform suspension by submitting new evidence.
   * - PENDING/UNDER_REVIEW current or open -> blocked by the
   *   one-open-submission invariant (unchanged).
   */
  async submitVerification(input: SubmitVerificationInput): Promise<{ verificationId: string }> {
    const now = input.now ?? new Date();
    if (input.licenseExpiryDate.getTime() <= now.getTime()) {
      throw new ForbiddenException('License expiry date must be in the future');
    }

    return this.prisma.client.$transaction(async (tx) => {
      await requireActiveTenantActorWithProvider(tx, input.actor, input.providerId);

      const provider = await tx.provider.findFirst({
        where: { id: input.providerId, tenantId: input.actor.tenantId, deletedAt: null },
        select: { id: true, providerType: true },
      });
      if (!provider) {
        throw new NotFoundException('Provider not found');
      }
      if (!VERIFIABLE_PROVIDER_TYPES.has(provider.providerType)) {
        throw new ForbiddenException('Provider type is not eligible for verification');
      }

      // Serialize against every other consequential transition for
      // this provider BEFORE reading any authoritative state.
      await this.acquireProviderLock(tx, input.actor.tenantId, input.providerId);

      const existingOpen = await tx.providerVerification.findFirst({
        where: {
          providerId: input.providerId,
          tenantId: input.actor.tenantId,
          status: { in: ['PENDING', 'UNDER_REVIEW'] },
        },
        select: { id: true },
      });
      if (existingOpen) {
        throw new ProviderVerificationConflictError('OPEN_SUBMISSION_ALREADY_EXISTS');
      }

      const existingCurrent = await tx.providerVerification.findFirst({
        where: { providerId: input.providerId, tenantId: input.actor.tenantId, isCurrent: true },
        select: { id: true, status: true, licenseExpiryDate: true },
      });

      if (existingCurrent?.status === 'SUSPENDED') {
        // CORRECTION (item 1): fail closed -- never demote/supersede a
        // platform suspension via a tenant-side submission. No row is
        // created, no audit event for a submission is emitted.
        throw new ProviderVerificationConflictError('CURRENT_VERIFICATION_SUSPENDED');
      }

      const currentIsValidApproval =
        !!existingCurrent &&
        existingCurrent.status === 'APPROVED' &&
        existingCurrent.licenseExpiryDate.getTime() > now.getTime();

      const makeNewRowCurrent = !currentIsValidApproval;

      if (makeNewRowCurrent && existingCurrent) {
        await tx.providerVerification.update({
          where: { id: existingCurrent.id },
          data: { isCurrent: false },
        });
      }

      let created: { id: string };
      try {
        created = await tx.providerVerification.create({
          data: {
            tenantId: input.actor.tenantId,
            providerId: input.providerId,
            providerType: provider.providerType,
            status: 'PENDING',
            licenseNumber: input.licenseNumber,
            licenseExpiryDate: input.licenseExpiryDate,
            businessRegistrationNumber: input.businessRegistrationNumber ?? null,
            governmentIdReference: input.governmentIdReference,
            isCurrent: makeNewRowCurrent,
          },
          select: { id: true },
        });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw new ProviderVerificationConflictError('OPEN_SUBMISSION_ALREADY_EXISTS');
        }
        throw error;
      }

      await this.audit.appendTenantUser(tx, {
        tenantId: input.actor.tenantId,
        actorMembershipId: input.actor.membershipId,
        actorUserId: input.actor.userId,
        eventType: verificationAuditEvent(
          provider.providerType,
          existingCurrent ? 'resubmitted' : 'submitted',
        ),
        outcome: 'SUCCEEDED',
        resourceType: 'ProviderVerification',
        resourceId: created.id,
        metadata: existingCurrent
          ? {
              verificationId: created.id,
              providerId: input.providerId,
              previousVerificationId: existingCurrent.id,
            }
          : { verificationId: created.id, providerId: input.providerId },
      });

      return { verificationId: created.id };
    });
  }

  /**
   * Returns BOTH the authoritative current state (if any) and any
   * separate open renewal submission (if one exists and differs from
   * the current row). Never returns internal `verificationNotes` or
   * reviewer identity.
   */
  async getCurrentState(actor: TrustedTenantActor, providerId: string) {
    await requireActiveTenantActorWithProvider(this.prisma.client, actor, providerId);
    const rows = await this.prisma.client.providerVerification.findMany({
      where: {
        providerId,
        tenantId: actor.tenantId,
        OR: [{ isCurrent: true }, { status: { in: ['PENDING', 'UNDER_REVIEW'] } }],
      },
      select: {
        id: true,
        status: true,
        licenseExpiryDate: true,
        submittedAt: true,
        verifiedAt: true,
        applicantMessage: true,
        version: true,
        isCurrent: true,
      },
    });
    const current = rows.find((r: (typeof rows)[number]) => r.isCurrent) ?? null;
    const openSubmission =
      rows.find((r: (typeof rows)[number]) => OPEN_STATUSES.has(r.status) && !r.isCurrent) ?? null;
    return { current, openSubmission };
  }

  /**
   * Bounded, cursor-paginated platform review queue.
   *
   * CORRECTED (item 4): ordering is now `submittedAt DESC, id DESC`
   * (a deterministic, fully unique tie-break) rather than
   * `submittedAt DESC` alone -- two rows sharing the exact same
   * `submittedAt` value could otherwise be skipped, duplicated, or
   * reordered unpredictably across pages. The opaque cursor now
   * encodes BOTH fields (`<submittedAtIso>|<id>`), and pagination
   * compares against that composite tuple rather than a single
   * column, matching the composite ordering exactly.
   */
  async listReviewQueue(input: {
    limit: number;
    cursor?: string;
    status?: string;
    businessNameSearch?: string;
  }) {
    const conditions: Record<string, unknown>[] = [{ providerId: { not: null } }];
    if (input.status) {
      conditions.push({ status: input.status });
    } else {
      conditions.push({
        OR: [{ isCurrent: true }, { status: { in: ['PENDING', 'UNDER_REVIEW'] } }],
      });
    }
    if (input.businessNameSearch) {
      conditions.push({
        provider: { businessName: { contains: input.businessNameSearch, mode: 'insensitive' } },
      });
    }
    if (input.cursor) {
      const decoded = decodeQueueCursor(input.cursor);
      conditions.push({
        OR: [
          { submittedAt: { lt: decoded.submittedAt } },
          { submittedAt: decoded.submittedAt, id: { lt: decoded.id } },
        ],
      });
    }
    const rows = await this.prisma.client.providerVerification.findMany({
      where: { AND: conditions },
      take: input.limit + 1,
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        providerId: true,
        status: true,
        isCurrent: true,
        submittedAt: true,
        licenseExpiryDate: true,
        provider: { select: { businessName: true } },
      },
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    if (page.some((row) => !row.providerId || !row.provider)) {
      throw new InternalServerErrorException('Verification provider linkage is invalid');
    }
    const last = page[page.length - 1];
    return {
      data: page.map((row) => ({ ...row, providerId: row.providerId!, provider: row.provider! })),
      nextCursor: hasMore && last ? encodeQueueCursor(last.submittedAt, last.id) : null,
    };
  }

  /** Platform reviewer detail view. Includes internal notes and a bounded duplicate-license signal, never automatic rejection. */
  async getReviewDetail(verificationId: string) {
    const row = await this.prisma.client.providerVerification.findUnique({
      where: { id: verificationId },
      select: {
        id: true,
        providerId: true,
        tenantId: true,
        status: true,
        isCurrent: true,
        licenseNumber: true,
        licenseExpiryDate: true,
        businessRegistrationNumber: true,
        governmentIdReference: true,
        verificationNotes: true,
        applicantMessage: true,
        submittedAt: true,
        verifiedAt: true,
        version: true,
        provider: { select: { businessName: true } },
      },
    });
    if (!row?.providerId || !row.provider) throw new NotFoundException('Verification not found');
    // CORRECTION (CTO review, item 5): historical submissions/renewals
    // for the SAME provider must never count as "another pharmacy"
    // sharing this license -- that would falsely flag a pharmacy's own
    // renewal history as a duplicate-provider signal. Only rows
    // belonging to a DIFFERENT provider (or legacy rows with no
    // provider linkage at all, since those cannot be attributed to
    // this provider one way or the other) count toward this
    // conservative, reviewer-only signal. This is never a global
    // uniqueness constraint and never causes automatic rejection.
    const duplicateCount = await this.prisma.client.providerVerification.count({
      where: {
        licenseNumber: row.licenseNumber,
        id: { not: row.id },
        OR: [{ providerId: { not: row.providerId } }, { providerId: null }],
      },
    });
    return {
      ...row,
      providerId: row.providerId,
      provider: row.provider,
      businessName: row.provider.businessName,
      possibleDuplicateLicenseCount: duplicateCount,
    };
  }

  /**
   * The PENDING -> UNDER_REVIEW transition and its exact-platform-user
   * audit event are written in ONE transaction, serialized by the
   * provider-level advisory lock, with authoritative state re-read
   * after the lock.
   */
  async beginReview(input: ReviewActionInput): Promise<void> {
    await this.assertReviewerStillAuthorized(input.reviewerActor);
    const now = input.now ?? new Date();
    await this.prisma.client.$transaction(async (tx) => {
      const submission = await tx.providerVerification.findUnique({
        where: { id: input.verificationId },
        select: { tenantId: true, providerId: true, providerType: true },
      });
      if (!submission?.providerId) {
        throw new ProviderVerificationConflictError('STALE_VERSION');
      }
      await this.acquireProviderLock(tx, submission.tenantId, submission.providerId);

      const result = await tx.providerVerification.updateMany({
        where: { id: input.verificationId, version: input.expectedVersion, status: 'PENDING' },
        data: { status: 'UNDER_REVIEW', version: { increment: 1 } },
      });
      if (result.count !== 1) {
        throw new ProviderVerificationConflictError('STALE_VERSION');
      }
      await this.audit.appendPlatformUser(tx, {
        platformActorUserId: input.reviewerActor.platformUserId,
        eventType: verificationAuditEvent(submission.providerType, 'review-started'),
        outcome: 'SUCCEEDED',
        resourceType: 'ProviderVerification',
        resourceId: input.verificationId,
        metadata: {
          verificationId: input.verificationId,
          providerId: submission.providerId,
          previousStatus: 'PENDING',
        },
        occurredAt: now,
      });
    });
  }

  /**
   * Approval: serialized by the provider-level advisory lock;
   * authoritative state (submission AND any current row) is re-read
   * AFTER the lock, closing the exact race the CTO review identified
   * (a concurrent transition demoting/promoting rows can no longer
   * interleave with this decision). If the submission is not already
   * current, atomically demotes the existing current row first and
   * then promotes this submission.
   */
  async approve(input: ReviewActionInput): Promise<void> {
    await this.assertReviewerStillAuthorized(input.reviewerActor);
    const now = input.now ?? new Date();
    await this.prisma.client.$transaction(async (tx) => {
      const preLockLookup = await tx.providerVerification.findUnique({
        where: { id: input.verificationId },
        select: { tenantId: true, providerId: true },
      });
      if (!preLockLookup?.providerId) {
        throw new ProviderVerificationConflictError('STALE_VERSION');
      }
      await this.acquireProviderLock(tx, preLockLookup.tenantId, preLockLookup.providerId);

      // Re-read AFTER the lock -- the only state this decision trusts.
      const submission = await tx.providerVerification.findUnique({
        where: { id: input.verificationId },
        select: {
          tenantId: true,
          providerId: true,
          providerType: true,
          status: true,
          licenseExpiryDate: true,
          isCurrent: true,
        },
      });
      if (!submission) {
        throw new ProviderVerificationConflictError('STALE_VERSION');
      }
      if (submission.status !== 'PENDING' && submission.status !== 'UNDER_REVIEW') {
        throw new ProviderVerificationConflictError('NOT_IN_ALLOWED_STATE');
      }
      if (submission.licenseExpiryDate.getTime() <= now.getTime()) {
        throw new ForbiddenException(
          'License is no longer valid; cannot approve an expired submission',
        );
      }
      if (!submission.providerId) {
        throw new ForbiddenException('Verification is not linked to a provider');
      }
      const provider = await tx.provider.findFirst({
        where: {
          id: submission.providerId,
          tenantId: submission.tenantId,
          deletedAt: null,
          providerType: submission.providerType,
        },
        select: { id: true, providerType: true },
      });
      if (!provider || !VERIFIABLE_PROVIDER_TYPES.has(provider.providerType)) {
        throw new NotFoundException('Provider no longer eligible for verification');
      }
      if (submission.providerType !== provider.providerType) {
        throw new ForbiddenException(
          'Verification providerType no longer matches the linked Provider',
        );
      }

      if (!submission.isCurrent) {
        const existingCurrent = await tx.providerVerification.findFirst({
          where: {
            providerId: submission.providerId,
            tenantId: submission.tenantId,
            isCurrent: true,
          },
          select: { id: true },
        });
        if (existingCurrent) {
          await tx.providerVerification.update({
            where: { id: existingCurrent.id },
            data: { isCurrent: false },
          });
        }
      }

      const updateResult = await tx.providerVerification.updateMany({
        where: {
          id: input.verificationId,
          version: input.expectedVersion,
          status: submission.status,
        },
        data: {
          status: 'APPROVED',
          version: { increment: 1 },
          verifiedAt: now,
          verifiedBy: input.reviewerActor.platformUserId,
          isCurrent: true,
        },
      });
      if (updateResult.count !== 1) {
        throw new ProviderVerificationConflictError('STALE_VERSION');
      }

      await tx.provider.update({
        where: { id: submission.providerId, tenantId: submission.tenantId },
        data: { isVerified: true },
      });

      await this.audit.appendPlatformUser(tx, {
        platformActorUserId: input.reviewerActor.platformUserId,
        eventType: verificationAuditEvent(submission.providerType, 'approved'),
        outcome: 'SUCCEEDED',
        resourceType: 'ProviderVerification',
        resourceId: input.verificationId,
        metadata: {
          verificationId: input.verificationId,
          providerId: submission.providerId,
          previousStatus: submission.status,
        },
        occurredAt: now,
      });
    });
  }

  /**
   * Rejection: serialized by the provider-level advisory lock;
   * authoritative state re-read AFTER the lock. If the rejected
   * submission was NOT the authoritative current row (a renewal being
   * rejected while an older valid approval remains current), the
   * existing approval and `Provider.isVerified` are left completely
   * untouched.
   */
  async reject(input: RejectActionInput): Promise<void> {
    await this.assertReviewerStillAuthorized(input.reviewerActor);
    const now = input.now ?? new Date();
    await this.prisma.client.$transaction(async (tx) => {
      const preLockLookup = await tx.providerVerification.findUnique({
        where: { id: input.verificationId },
        select: { tenantId: true, providerId: true },
      });
      if (!preLockLookup?.providerId) {
        throw new ProviderVerificationConflictError('STALE_VERSION');
      }
      await this.acquireProviderLock(tx, preLockLookup.tenantId, preLockLookup.providerId);

      const submission = await tx.providerVerification.findUnique({
        where: { id: input.verificationId },
        select: {
          tenantId: true,
          providerId: true,
          providerType: true,
          status: true,
          isCurrent: true,
        },
      });
      if (!submission) {
        throw new ProviderVerificationConflictError('STALE_VERSION');
      }
      if (submission.status !== 'PENDING' && submission.status !== 'UNDER_REVIEW') {
        throw new ProviderVerificationConflictError('NOT_IN_ALLOWED_STATE');
      }
      const updateResult = await tx.providerVerification.updateMany({
        where: {
          id: input.verificationId,
          version: input.expectedVersion,
          status: submission.status,
        },
        data: {
          status: 'REJECTED',
          version: { increment: 1 },
          verifiedAt: now,
          verifiedBy: input.reviewerActor.platformUserId,
          applicantMessage: input.applicantMessage ?? null,
          verificationNotes: input.verificationNotes ?? null,
        },
      });
      if (updateResult.count !== 1) {
        throw new ProviderVerificationConflictError('STALE_VERSION');
      }
      if (submission.isCurrent && submission.providerId) {
        await tx.provider.update({
          where: { id: submission.providerId, tenantId: submission.tenantId },
          data: { isVerified: false },
        });
      }
      await this.audit.appendPlatformUser(tx, {
        platformActorUserId: input.reviewerActor.platformUserId,
        eventType: verificationAuditEvent(submission.providerType, 'rejected'),
        outcome: 'SUCCEEDED',
        resourceType: 'ProviderVerification',
        resourceId: input.verificationId,
        metadata: {
          verificationId: input.verificationId,
          providerId: submission.providerId ?? '',
          previousStatus: submission.status,
        },
        occurredAt: now,
      });
    });
  }

  /**
   * Suspension: serialized by the SAME provider-level advisory lock as
   * every other consequential transition -- this is the exact fix for
   * the CTO-identified race, where a concurrent renewal approval's
   * demote/promote could interleave with a suspend reading stale
   * "isCurrent" state. Authoritative state (including `isCurrent`) is
   * re-read AFTER the lock; the final mutation's WHERE clause still
   * ALSO requires `isCurrent: true` as a second, redundant guard (the
   * lock is the actual correctness guarantee; the predicate is
   * defense in depth). Never touches tenant membership or staff
   * accounts.
   */
  async suspend(input: SuspendActionInput): Promise<void> {
    await this.assertReviewerStillAuthorized(input.reviewerActor);
    const now = input.now ?? new Date();
    await this.prisma.client.$transaction(async (tx) => {
      const preLockLookup = await tx.providerVerification.findUnique({
        where: { id: input.verificationId },
        select: { tenantId: true, providerId: true },
      });
      if (!preLockLookup?.providerId) {
        throw new ProviderVerificationConflictError('STALE_VERSION');
      }
      await this.acquireProviderLock(tx, preLockLookup.tenantId, preLockLookup.providerId);

      const current = await tx.providerVerification.findUnique({
        where: { id: input.verificationId },
        select: {
          tenantId: true,
          providerId: true,
          providerType: true,
          status: true,
          isCurrent: true,
        },
      });
      if (!current || !current.isCurrent) {
        throw new ProviderVerificationConflictError('STALE_VERSION');
      }
      if (current.status !== 'APPROVED') {
        throw new ProviderVerificationConflictError('NOT_IN_ALLOWED_STATE');
      }
      const updateResult = await tx.providerVerification.updateMany({
        where: {
          id: input.verificationId,
          version: input.expectedVersion,
          status: 'APPROVED',
          isCurrent: true,
        },
        data: {
          status: 'SUSPENDED',
          version: { increment: 1 },
          verificationNotes: input.verificationNotes ?? null,
        },
      });
      if (updateResult.count !== 1) {
        throw new ProviderVerificationConflictError('STALE_VERSION');
      }
      if (current.providerId) {
        await tx.provider.update({
          where: { id: current.providerId, tenantId: current.tenantId },
          data: { isVerified: false },
        });
      }
      await this.audit.appendPlatformUser(tx, {
        platformActorUserId: input.reviewerActor.platformUserId,
        eventType: verificationAuditEvent(current.providerType, 'suspended'),
        outcome: 'SUCCEEDED',
        resourceType: 'ProviderVerification',
        resourceId: input.verificationId,
        metadata: {
          verificationId: input.verificationId,
          providerId: current.providerId ?? '',
          previousStatus: 'APPROVED',
        },
        occurredAt: now,
      });
    });
  }

  /**
   * Returns only the safe, pharmacy-facing profile fields for the
   * assigned provider. Never returns `isVerified`, `isActive`,
   * `deletedAt`, `tenantId`, or any membership/role/permission data --
   * this is a profile read, not a verification or authorization read
   * (see `getCurrentState` for verification state).
   */
  async getProfile(actor: TrustedTenantActor, providerId: string) {
    await requireActiveTenantActorWithProvider(this.prisma.client, actor, providerId);
    const provider = await this.prisma.client.provider.findFirst({
      where: {
        id: providerId,
        tenantId: actor.tenantId,
        deletedAt: null,
      },
      select: {
        businessName: true,
        ownerName: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
        latitude: true,
        longitude: true,
      },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    return provider;
  }

  /**
   * Updates permitted pharmacy profile fields on the underlying
   * `Provider` row -- tenant/provider-authorized, and now additionally
   * requires the provider to still be PHARMACY (item H's fail-closed
   * pattern reused here), never touching `providerType`, `isVerified`,
   * `isActive`, or `deletedAt` (never client-settable through this
   * endpoint -- see the controller/DTO for the explicit allowlist
   * mapping that keeps arbitrary request fields from ever reaching
   * this method). Only the fields explicitly present in `updates` are
   * changed (partial update).
   */
  async updateProfile(
    actor: TrustedTenantActor,
    providerId: string,
    updates: Record<string, string | number>,
  ): Promise<void> {
    await requireActiveTenantActorWithProvider(this.prisma.client, actor, providerId);
    const provider = await this.prisma.client.provider.findFirst({
      where: {
        id: providerId,
        tenantId: actor.tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    await this.prisma.client.provider.update({
      where: { id: providerId, tenantId: actor.tenantId },
      data: updates,
    });
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

// --- Deterministic keyset pagination helpers (item 4) -----------------------

export function encodeQueueCursor(submittedAt: Date, id: string): string {
  return Buffer.from(`${submittedAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

// Same canonical UUID v4-shaped format the accepted schema uses
// throughout (`@default(uuid())` in schema.prisma) -- reused here so
// the decoded cursor component is validated against the repository's
// own accepted identifier form, not accepted as any arbitrary
// non-empty string.
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function decodeQueueCursor(cursor: string): { submittedAt: Date; id: string } {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 256) {
    throw new ForbiddenException('Malformed pagination cursor');
  }
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new ForbiddenException('Malformed pagination cursor');
  }
  if (Buffer.from(decoded, 'utf8').toString('base64url') !== cursor) {
    throw new ForbiddenException('Malformed pagination cursor');
  }
  const separatorIndex = decoded.lastIndexOf('|');
  if (separatorIndex === -1) {
    throw new ForbiddenException('Malformed pagination cursor');
  }
  const isoDate = decoded.slice(0, separatorIndex);
  const id = decoded.slice(separatorIndex + 1);
  const submittedAt = new Date(isoDate);
  if (Number.isNaN(submittedAt.getTime())) {
    throw new ForbiddenException('Malformed pagination cursor');
  }
  if (id.length === 0 || !UUID_V4_PATTERN.test(id)) {
    throw new ForbiddenException('Malformed pagination cursor');
  }
  return { submittedAt, id };
}
