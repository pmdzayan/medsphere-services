/**
 * Task 0026 - Live Availability Request & Pharmacist Confirmation service.
 *
 * This service owns:
 * - public request creation (one provider + one active product, NO patient
 *   medical data, server-derived tenant), with current-evidence short-circuit,
 *   active-request reuse/dedup, safe expiry of superseded PENDING requests,
 *   and database-enforced single-effective-PENDING concurrency;
 * - the operational queue read for assigned staff;
 * - atomic pharmacist response (authorization, idempotent replay/conflict,
 *   expired-request rejection, one-winner concurrency, append-only
 *   provider/product evidence, exact-user audit, transactional event).
 *
 * Quantity invariant: a pharmacist response NEVER writes a Batch quantity, a
 * BatchStockObservation, or a StockMovement. Batch (Task 0025) remains the
 * only quantity authority. Evidence is provider/product-level temporary
 * evidence that expires on its bounded validity window.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SerializableRetryError,
  hasPrismaCode,
  withSerializableRetry,
  type AuditRequestContext,
} from '@medsphere/database';
import { appMetrics } from '@medsphere/common';
import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertTrustedProviderAccess } from './inventory-access';
import { InventoryEventWriter } from './inventory-event-writer';
import { LiveAvailabilityReconciliationService } from './live-availability-reconciliation.service';
import {
  acceptedRetryAfterMinutes,
  isPendingRequestExpired,
  parseAvailabilityRequestEnvironment,
  type AvailabilityRequestPolicy,
} from './availability-request-policy';
import {
  parseAvailabilityFreshnessEnvironment,
  type AvailabilityFreshnessPolicy,
} from './availability-freshness-policy';
import {
  PHARMACIST_CONFIRMATION_OUTCOMES,
  type AvailabilityRequestQueueRow,
  type AvailabilityResponseResult,
  type PharmacistConfirmationOutcome,
  type PublicAvailabilityResolution,
} from './availability-request.types';
import type { TrustedInventoryActor } from './inventory-command.types';

const PUBLIC_NOT_FOUND = 'Provider or product not found.';
const REQUEST_SERIALIZABLE_ATTEMPTS = 10;
const MINUTE_MS = 60_000;
const MAX_QUEUE_LIMIT = 50;

export interface CreateAvailabilityRequestOutcome {
  readonly requestId: string | null;
  readonly resolution: PublicAvailabilityResolution;
  readonly created: boolean;
  readonly reused: boolean;
  readonly currentEvidence: boolean;
}

export interface AvailabilityQueueResult {
  readonly data: readonly AvailabilityRequestQueueRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface AvailabilityQueueQuery {
  readonly limit: number;
  readonly offset: number;
}

export interface RespondAvailabilityRequestInput {
  readonly outcome: PharmacistConfirmationOutcome;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly retryAfterMinutes?: number;
  readonly request?: AuditRequestContext;
}

export interface AvailabilityRequestServiceOptions {
  readonly now?: Date;
  readonly requestPolicy?: AvailabilityRequestPolicy;
  readonly freshnessPolicy?: AvailabilityFreshnessPolicy;
}
@Injectable()
export class AvailabilityRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly events: InventoryEventWriter,
    private readonly reconciliation: LiveAvailabilityReconciliationService,
  ) {}

  async createPublicRequest(
    providerId: string,
    productId: string,
    options: AvailabilityRequestServiceOptions = {},
  ): Promise<CreateAvailabilityRequestOutcome> {
    const now = this.assertNow(options.now);
    const requestPolicy = options.requestPolicy ?? parseAvailabilityRequestEnvironment(process.env);
    const freshnessPolicy =
      options.freshnessPolicy ?? parseAvailabilityFreshnessEnvironment(process.env);

    // -- Server-side eligibility -----------------------------------------
    const provider = await this.prisma.client.provider.findFirst({
      where: { id: providerId, isActive: true, isVerified: true, deletedAt: null },
      select: { id: true, tenantId: true },
    });
    if (!provider) throw new NotFoundException(PUBLIC_NOT_FOUND);
    const tenantId = provider.tenantId;

    const product = await this.prisma.client.product.findFirst({
      where: { id: productId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException(PUBLIC_NOT_FOUND);

    const listing = await this.prisma.client.inventory.findFirst({
      where: {
        tenantId,
        providerId,
        productId,
        isVisible: true,
        deletedAt: null,
        provider: { isActive: true, isVerified: true, deletedAt: null },
        product: { isActive: true, deletedAt: null },
      },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException(PUBLIC_NOT_FOUND);

    // -- 1. Current valid evidence short-circuit -------------------------
    const evidence = await this.reconciliation.findCurrentEvidence(tenantId, providerId, productId);
    if (evidence && this.reconciliation.isValidLiveState(evidence, now)) {
      const resolution = await this.reconciliation.resolveProviderProduct(
        tenantId,
        providerId,
        productId,
        { now, freshnessPolicy },
      );
      return {
        requestId: resolution.requestId,
        resolution,
        created: false,
        reused: false,
        currentEvidence: true,
      };
    }
    return this.createOrReusePendingRequest(
      tenantId,
      providerId,
      productId,
      now,
      requestPolicy,
      freshnessPolicy,
    );
  }

  private async createOrReusePendingRequest(
    tenantId: string,
    providerId: string,
    productId: string,
    now: Date,
    requestPolicy: AvailabilityRequestPolicy,
    freshnessPolicy: AvailabilityFreshnessPolicy,
  ): Promise<CreateAvailabilityRequestOutcome> {
    try {
      const transactionOutcome = await withSerializableRetry(
        this.prisma.client,
        async (transaction) => {
          const pending = await transaction.availabilityRequest.findFirst({
            where: {
              tenantId,
              providerId,
              productId,
              status: 'PENDING',
              expiresAt: { gt: now },
            },
            select: { id: true },
            orderBy: { requestedAt: 'desc' },
          });
          if (pending) {
            return {
              requestId: pending.id,
              created: false,
              reused: true,
            };
          }

          // Close any superseded expired-but-PENDING request before creating a
          // new one so the operational queue never accumulates stale rows.
          await transaction.availabilityRequest.updateMany({
            where: {
              tenantId,
              providerId,
              productId,
              status: 'PENDING',
              expiresAt: { lte: now },
            },
            data: { status: 'EXPIRED', activeDedupKey: null, version: { increment: 1 } },
          });

          const requestId = randomUUID();
          const requestedAt = now;
          const expiresAt = new Date(now.getTime() + requestPolicy.requestLifetimeMs);

          await transaction.availabilityRequest.create({
            data: {
              id: requestId,
              tenantId,
              providerId,
              productId,
              status: 'PENDING',
              activeDedupKey: `${providerId}:${productId}`,
              requestedAt,
              expiresAt,
              version: 1,
            },
            select: { id: true },
          });

          await this.events.appendTenantSystem(transaction, tenantId, 'public-live-availability', {
            eventType: 'inventory.availability.request.created',
            aggregateType: 'AvailabilityRequest',
            aggregateId: requestId,
            occurredAt: requestedAt,
            payload: {
              providerId,
              productId,
              requestId,
              expiresAt: expiresAt.toISOString(),
            },
          });

          return {
            requestId,
            created: true,
            reused: false,
          };
        },
        REQUEST_SERIALIZABLE_ATTEMPTS,
      );

      // Reconciliation reads through the root Prisma client. Resolve only
      // after commit so the newly-created request is actually visible.
      const resolution = await this.reconciliation.resolveProviderProduct(
        tenantId,
        providerId,
        productId,
        { now, freshnessPolicy },
      );

      return {
        ...transactionOutcome,
        resolution,
        currentEvidence: false,
      };
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        // PostgreSQL aborts the interactive transaction after a uniqueness
        // violation. Recover the dedupe race only after rollback.
        const concurrent = await this.prisma.client.availabilityRequest.findFirst({
          where: {
            tenantId,
            providerId,
            productId,
            status: 'PENDING',
            expiresAt: { gt: now },
          },
          select: { id: true },
          orderBy: { requestedAt: 'desc' },
        });

        if (concurrent) {
          const resolution = await this.reconciliation.resolveProviderProduct(
            tenantId,
            providerId,
            productId,
            { now, freshnessPolicy },
          );
          return {
            requestId: concurrent.id,
            resolution,
            created: false,
            reused: true,
            currentEvidence: false,
          };
        }
      }

      if (hasPrismaCode(error, 'P2034')) {
        throw new ConflictException('Concurrent availability request creation detected');
      }

      throw error;
    }
  }
  async listProviderQueue(
    actor: TrustedInventoryActor,
    providerId: string,
    query: AvailabilityQueueQuery,
  ): Promise<AvailabilityQueueResult> {
    const limit = normalizeLimit(query.limit);
    const offset = normalizeOffset(query.offset);
    await assertTrustedProviderAccess(this.prisma.client, actor, providerId);
    const tenantId = actor.tenantId;

    const [pending, responded, pendingCount] = await Promise.all([
      this.prisma.client.availabilityRequest.findMany({
        where: { tenantId, providerId, status: 'PENDING' },
        select: this.queueSelect(),
        orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.client.availabilityRequest.findMany({
        where: { tenantId, providerId, status: 'RESPONDED' },
        select: this.queueSelect(),
        orderBy: [{ respondedAt: 'desc' }, { id: 'desc' }],
        take: limit,
        skip: 0,
      }),
      this.prisma.client.availabilityRequest.count({
        where: { tenantId, providerId, status: 'PENDING' },
      }),
    ]);

    // PENDING rows first (page fill), then recent RESPONDED rows to fill the
    // remainder of the page so a fresh page never looks empty when the
    // provider has responded history.
    const data = [...pending, ...responded.slice(0, Math.max(0, limit - pending.length))].map(
      (row) => toQueueRow(row),
    );
    return { data, total: pendingCount, limit, offset };
  }

  async getPublicStatus(
    requestId: string,
    now = new Date(),
  ): Promise<PublicAvailabilityResolution> {
    const request = await this.prisma.client.availabilityRequest.findFirst({
      where: {
        id: requestId,
        status: { in: ['PENDING' as const, 'RESPONDED' as const] },
      },
      select: { id: true, tenantId: true, providerId: true, productId: true },
    });
    if (!request) throw new NotFoundException(PUBLIC_NOT_FOUND);

    const provider = await this.prisma.client.provider.findFirst({
      where: { id: request.providerId, isActive: true, isVerified: true, deletedAt: null },
      select: { id: true },
    });
    if (!provider) return unresolvedPublicState();

    return this.reconciliation.resolveProviderProduct(
      request.tenantId,
      request.providerId,
      request.productId,
      { now },
    );
  }
  /**
   * Atomic pharmacist response.
   *
   * One serializable transaction:
   *  1. authorize the authenticated staff member (live provider assignment);
   *  2. load & validate the request inside its tenant/provider scope;
   *  3. reject expired requests;
   *  4. resolve idempotent replay (same key+content -> no-op replay; same key
   *     with different content -> conflict);
   *  5. prevent two conflicting responders from both winning via a guarded
   *     conditional update (version + status), so exactly one effective
   *     response commits;
   *  6. append provider/product confirmation evidence (append-only);
   *  7. transition the request;
   *  8. write exact-user audit evidence;
   *  9. enqueue the transactional response event in the same transaction.
   *
   * A pharmacist response never touches Batch quantities, held reservation
   * quantities, BatchStockObservation, or StockMovement.
   */
  async respond(
    actor: TrustedInventoryActor,
    providerId: string,
    requestId: string,
    input: RespondAvailabilityRequestInput,
    options: AvailabilityRequestServiceOptions = {},
  ): Promise<AvailabilityResponseResult> {
    const now = this.assertNow(options.now);
    const requestPolicy = options.requestPolicy ?? parseAvailabilityRequestEnvironment(process.env);
    this.validateResponseInput(input, requestPolicy);
    const commandHash = this.responseCommandHash(
      actor,
      providerId,
      requestId,
      input,
      requestPolicy,
    );

    try {
      return await withSerializableRetry(
        this.prisma.client,
        async (transaction) => {
          await assertTrustedProviderAccess(transaction, actor, providerId);

          const request = await transaction.availabilityRequest.findFirst({
            where: { id: requestId, tenantId: actor.tenantId, providerId },
            select: {
              id: true,
              providerId: true,
              productId: true,
              status: true,
              requestedAt: true,
              expiresAt: true,
              version: true,
            },
          });
          if (!request) throw new NotFoundException('Availability request not found');
          if (request.status === 'EXPIRED') {
            throw new ConflictException('Availability request has expired');
          }
          if (isPendingRequestExpired(request.expiresAt, now)) {
            throw new ConflictException('Availability request has expired');
          }

          // Idempotency replay resolution comes before the "already responded"
          // guard so an exact retry of a committed response is a safe no-op.
          const priorEvidence = await transaction.providerProductAvailabilityEvidence.findFirst({
            where: { tenantId: actor.tenantId, idempotencyKey: input.idempotencyKey },
            select: {
              outcome: true,
              commandHash: true,
              confirmedAt: true,
              validUntil: true,
              retryAfterAt: true,
            },
          });
          if (priorEvidence) {
            if (priorEvidence.commandHash !== commandHash) {
              throw new ConflictException(
                'Availability response idempotency key is already used by a different response',
              );
            }
            return {
              requestId,
              outcome: priorEvidence.outcome,
              confirmedAt: priorEvidence.confirmedAt,
              validUntil: priorEvidence.validUntil,
              retryAfterAt: priorEvidence.retryAfterAt,
              replayed: true,
            };
          }
          if (request.status === 'RESPONDED') {
            throw new ConflictException('Availability request has already been responded to');
          }
          if (input.expectedVersion !== request.version) {
            throw new ConflictException('Availability request version conflict');
          }
          const [{ confirmedAt }] = await transaction.$queryRaw<Array<{ confirmedAt: Date }>>(
            Prisma.sql`SELECT CURRENT_TIMESTAMP AS "confirmedAt"`,
          );
          if (!(confirmedAt instanceof Date) || Number.isNaN(confirmedAt.getTime())) {
            throw new Error('Database timestamp was not returned');
          }

          const updated = await transaction.availabilityRequest.updateMany({
            where: {
              id: request.id,
              tenantId: actor.tenantId,
              providerId,
              status: 'PENDING',
              version: input.expectedVersion,
            },
            data: {
              status: 'RESPONDED',
              respondedAt: confirmedAt,
              activeDedupKey: null,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            // Another responder won the same request; retry will observe the
            // committed RESPONDED state and fail with a clean conflict.
            throw new SerializableRetryError('Concurrent availability response detected');
          }
          const resultingVersion = request.version + 1;

          const validUntil =
            input.outcome === 'CHECK_LATER'
              ? null
              : new Date(confirmedAt.getTime() + requestPolicy.confirmationValidityMs);
          const retryAfterAt =
            input.outcome === 'CHECK_LATER'
              ? new Date(
                  confirmedAt.getTime() +
                    (this.resolveRetryMinutes(input, requestPolicy) as number) * MINUTE_MS,
                )
              : null;

          await transaction.providerProductAvailabilityEvidence.create({
            data: {
              id: randomUUID(),
              tenantId: actor.tenantId,
              providerId,
              productId: request.productId,
              availabilityRequestId: request.id,
              source: 'PHARMACIST_CONFIRMATION',
              outcome: input.outcome,
              confirmedAt,
              validUntil,
              retryAfterAt,
              responderMembershipId: actor.membershipId,
              responderUserId: actor.userId,
              idempotencyKey: input.idempotencyKey,
              commandHash,
            },
            select: { id: true, createdAt: true },
          });

          await this.audit.appendTenantUser(transaction, {
            tenantId: actor.tenantId,
            actorMembershipId: actor.membershipId,
            actorUserId: actor.userId,
            eventType: 'inventory.availability-request.responded',
            outcome: 'SUCCEEDED',
            resourceType: 'AvailabilityRequest',
            resourceId: request.id,
            metadata: { outcome: input.outcome },
            request: input.request,
          });

          await this.events.appendTenantUser(transaction, actor, {
            eventType: 'inventory.availability.request.responded',
            aggregateType: 'AvailabilityRequest',
            aggregateId: request.id,
            occurredAt: confirmedAt,
            payload: {
              providerId,
              productId: request.productId,
              requestId: request.id,
              outcome: input.outcome,
              version: resultingVersion,
            },
          });

          appMetrics.availabilityResponseTotal.increment({ outcome: input.outcome.toLowerCase() });
          appMetrics.availabilityRequestToResponseMs.observe(
            confirmedAt.getTime() - request.requestedAt.getTime(),
          );

          return {
            requestId: request.id,
            outcome: input.outcome,
            confirmedAt,
            validUntil,
            retryAfterAt,
            replayed: false,
          };
        },
        REQUEST_SERIALIZABLE_ATTEMPTS,
      );
    } catch (error) {
      if (!hasPrismaCode(error, 'P2034')) throw error;
      throw new ConflictException('Concurrent availability response detected');
    }
  }
  private validateResponseInput(
    input: RespondAvailabilityRequestInput,
    requestPolicy: AvailabilityRequestPolicy,
  ): void {
    if (!(PHARMACIST_CONFIRMATION_OUTCOMES as readonly string[]).includes(input.outcome)) {
      throw new BadRequestException('Availability response outcome is not accepted');
    }
    this.validateIdempotencyKey(input.idempotencyKey);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new BadRequestException(
        'Availability request expected version must be a positive safe integer',
      );
    }
    if (input.outcome === 'CHECK_LATER') {
      const accepted = acceptedRetryAfterMinutes(input.retryAfterMinutes, requestPolicy);
      if (accepted === null) {
        const minimum = Math.ceil(requestPolicy.retryAfterMinimumMs / MINUTE_MS);
        const maximum = Math.floor(requestPolicy.retryAfterMaximumMs / MINUTE_MS);
        throw new BadRequestException(
          `CHECK_LATER retry delay must be a whole number of minutes between ${minimum} and ${maximum}`,
        );
      }
    } else if (input.retryAfterMinutes !== undefined) {
      throw new BadRequestException('Retry delay is only accepted for CHECK_LATER');
    }
  }

  private resolveRetryMinutes(
    input: RespondAvailabilityRequestInput,
    requestPolicy: AvailabilityRequestPolicy,
  ): number | null {
    if (input.outcome !== 'CHECK_LATER') return null;
    return acceptedRetryAfterMinutes(input.retryAfterMinutes, requestPolicy);
  }

  private validateIdempotencyKey(value: string): void {
    if (value.length === 0 || value.length > 120 || value !== value.trim()) {
      throw new BadRequestException('Idempotency key must contain 1 to 120 trimmed characters');
    }
  }

  private responseCommandHash(
    actor: TrustedInventoryActor,
    providerId: string,
    requestId: string,
    input: RespondAvailabilityRequestInput,
    requestPolicy: AvailabilityRequestPolicy,
  ): string {
    const retryMinutes =
      input.outcome === 'CHECK_LATER'
        ? acceptedRetryAfterMinutes(input.retryAfterMinutes, requestPolicy)
        : null;
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: actor.tenantId,
          providerId,
          requestId,
          actorMembershipId: actor.membershipId,
          actorUserId: actor.userId,
          outcome: input.outcome,
          retryAfterMinutes: retryMinutes,
        }),
      )
      .digest('hex');
  }

  private queueSelect(): Prisma.AvailabilityRequestSelect {
    return {
      id: true,
      productId: true,
      product: {
        select: {
          name: true,
          genericName: true,
          brand: true,
          strength: true,
          dosageForm: true,
        },
      },
      status: true,
      requestedAt: true,
      expiresAt: true,
      version: true,
    };
  }

  private assertNow(now: Date | undefined): Date {
    const resolved = now ?? new Date();
    if (!Number.isFinite(resolved.getTime())) {
      throw new Error('Availability request clock is invalid');
    }
    return resolved;
  }
}

function normalizeLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) return 25;
  return Math.min(value, MAX_QUEUE_LIMIT);
}

function normalizeOffset(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) return 0;
  return Math.min(value, 10_000);
}

function toQueueRow(row: QueueRowSource): AvailabilityRequestQueueRow {
  return {
    requestId: row.id,
    productId: row.productId,
    productName: row.product.name,
    genericName: row.product.genericName,
    brand: row.product.brand,
    strength: row.product.strength,
    dosageForm: row.product.dosageForm,
    status: row.status,
    requestedAt: row.requestedAt,
    expiresAt: row.expiresAt,
    version: row.version,
  };
}

function unresolvedPublicState(): PublicAvailabilityResolution {
  return {
    requestId: null,
    requestStatus: 'NONE',
    requestedAt: null,
    expiresAt: null,
    respondedAt: null,
    availabilityState: 'UNKNOWN',
    confirmationSource: null,
    confirmedAt: null,
    retryAfterAt: null,
  };
}

type QueueRowSource = {
  readonly id: string;
  readonly productId: string;
  readonly product: {
    readonly name: string;
    readonly genericName: string | null;
    readonly brand: string;
    readonly strength: string;
    readonly dosageForm: string;
  };
  readonly status: 'PENDING' | 'RESPONDED' | 'EXPIRED';
  readonly requestedAt: Date;
  readonly expiresAt: Date;
  readonly version: number;
};
