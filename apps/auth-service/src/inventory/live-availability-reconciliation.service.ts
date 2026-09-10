/**
 * Task 0026 - Canonical live-availability reconciliation layer.
 *
 * Combines:
 *   1. the Task 0025 canonical AvailabilityTrustService / pure evaluator
 *      (authoritative for AIM-managed batch freshness), and
 *   2. the newest still-valid provider/product pharmacist-confirmation
 *      evidence (an additional temporary trust signal).
 *
 * Resolution rules:
 * - Valid recent pharmacist AVAILABLE   -> AVAILABLE (PHARMACY_CONFIRMED).
 * - Valid recent pharmacist UNAVAILABLE -> UNAVAILABLE (PHARMACY_CONFIRMED).
 * - CHECK_LATER with retryAfterAt still in the future ->
 *   CONFIRMATION_REQUIRED plus bounded retryAfterAt.
 * - No valid live evidence -> canonical Task 0025 trust evaluation
 *   (AVAILABLE / UNAVAILABLE / CONFIRMATION_REQUIRED / UNKNOWN).
 * - Expired pharmacist evidence is ignored for current availability.
 *
 * The Task 0025 batch evaluator is NOT rewritten here; this layer only loads
 * authoritative snapshots and delegates interpretation to the pure evaluator.
 * Inactive/unverified/deleted providers and inactive/deleted products must
 * never reach an active patient-facing availability claim: the public
 * boundary enforces provider/product/listing eligibility before invoking.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityTrustEvaluator } from './availability-trust.evaluator';
import {
  parseAvailabilityFreshnessEnvironment,
  type AvailabilityFreshnessPolicy,
} from './availability-freshness-policy';
import type {
  AvailabilityTrustEvaluation,
  BatchAvailabilityCandidate,
  BatchStockEvidence,
} from './availability.types';
import type {
  PharmacistConfirmationOutcome,
  PublicAvailabilityResolution,
  PublicAvailabilityState,
} from './availability-request.types';

export interface ResolveLiveAvailabilityOptions {
  readonly now?: Date;
  readonly freshnessPolicy?: AvailabilityFreshnessPolicy;
}

/** Newest live evidence snapshot for one provider/product (internal view). */
export interface LiveEvidenceSnapshot {
  readonly requestId: string;
  readonly outcome: PharmacistConfirmationOutcome;
  readonly confirmedAt: Date;
  readonly validUntil: Date | null;
  readonly retryAfterAt: Date | null;
}

/** Active PENDING request snapshot for one provider/product (internal view). */
export interface PendingRequestSnapshot {
  readonly requestId: string;
  readonly requestedAt: Date;
  readonly expiresAt: Date;
}

@Injectable()
export class LiveAvailabilityReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluator: AvailabilityTrustEvaluator,
  ) {}

  /**
   * Resolves the public availability for one provider/product inside a
   * tenant. Provider/product eligibility is enforced by the public boundary
   * before this is called.
   */
  async resolveProviderProduct(
    tenantId: string,
    providerId: string,
    productId: string,
    options: ResolveLiveAvailabilityOptions = {},
  ): Promise<PublicAvailabilityResolution> {
    const now = this.assertNow(options.now);
    const policy = options.freshnessPolicy ?? parseAvailabilityFreshnessEnvironment(process.env);
    const trust = await this.evaluateTrust(tenantId, providerId, productId, now, policy);
    const [evidence, pending] = await Promise.all([
      this.loadNewestEvidence(tenantId, providerId, productId),
      this.loadPendingRequest(tenantId, providerId, productId, now),
    ]);
    return this.composeResolution(trust, evidence, pending, now);
  }
  /**
   * Batch read path used by public medicine search: resolves many products of
   * one provider in a tenant with the same canonical rules.
   */
  async resolveProviderProducts(
    tenantId: string,
    providerId: string,
    productIds: readonly string[],
    options: ResolveLiveAvailabilityOptions = {},
  ): Promise<Map<string, PublicAvailabilityResolution>> {
    if (productIds.length === 0) return new Map();
    const now = this.assertNow(options.now);
    const policy = options.freshnessPolicy ?? parseAvailabilityFreshnessEnvironment(process.env);

    const inventory = await this.prisma.client.inventory.findMany({
      where: { tenantId, providerId, productId: { in: [...productIds] }, deletedAt: null },
      select: { id: true, productId: true },
    });
    const inventoryByProduct = new Map(inventory.map((row) => [row.productId, row.id]));

    const batchRows = await this.prisma.client.batch.findMany({
      where: { tenantId, providerId, productId: { in: [...productIds] } },
      select: {
        id: true,
        inventoryId: true,
        productId: true,
        expiryDate: true,
        onHandQuantity: true,
        heldQuantity: true,
        status: true,
        deletedAt: true,
      },
      orderBy: [{ productId: 'asc' }, { expiryDate: 'asc' }, { id: 'asc' }],
    });

    const batchesByProduct = new Map<string, BatchAvailabilityCandidate[]>();
    for (const row of batchRows) {
      const list = batchesByProduct.get(row.productId) ?? [];
      list.push({
        id: row.id,
        inventoryId: row.inventoryId,
        productId: row.productId,
        expiryDate: row.expiryDate,
        onHandQuantity: row.onHandQuantity,
        heldQuantity: row.heldQuantity,
        status: row.status,
        deletedAt: row.deletedAt,
      });
      batchesByProduct.set(row.productId, list);
    }
    const allBatchIds = batchRows.map((row) => row.id);
    const evidenceByBatch = new Map<string, BatchStockEvidence>();
    if (allBatchIds.length > 0) {
      const observations = await this.prisma.client.batchStockObservation.findMany({
        where: { tenantId, batchId: { in: allBatchIds } },
        select: { batchId: true, source: true, occurredAt: true, observedOnHandQuantity: true },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      });
      for (const observation of observations) {
        if (evidenceByBatch.has(observation.batchId)) continue;
        evidenceByBatch.set(observation.batchId, {
          source: observation.source,
          observedAt: observation.occurredAt,
          observedOnHandQuantity: observation.observedOnHandQuantity,
        });
      }
    }

    const [liveEvidence, pendingByProduct] = await Promise.all([
      this.loadNewestEvidenceForProductIds(tenantId, providerId, productIds),
      this.loadPendingRequests(tenantId, providerId, productIds, now),
    ]);

    const results = new Map<string, PublicAvailabilityResolution>();
    for (const productId of productIds) {
      const batches = batchesByProduct.get(productId) ?? [];
      const inventoryId = inventoryByProduct.get(productId) ?? null;
      const trust = this.evaluator.evaluateInventory(
        { inventoryId, batches, evidenceByBatch: subset(evidenceByBatch, batches) },
        { now, policy },
      );
      results.set(
        productId,
        this.composeResolution(
          trust,
          liveEvidence.get(productId) ?? null,
          pendingByProduct.get(productId) ?? null,
          now,
        ),
      );
    }
    return results;
  }
  /**
   * True while valid live evidence is currently producing a live outcome.
   * Used by request creation to answer with current evidence rather than
   * creating another request.
   */
  isValidLiveState(evidence: LiveEvidenceSnapshot | null, now: Date): boolean {
    if (evidence === null) return false;
    if (evidence.outcome === 'CHECK_LATER') {
      return evidence.retryAfterAt !== null && evidence.retryAfterAt.getTime() > now.getTime();
    }
    return evidence.validUntil !== null && evidence.validUntil.getTime() > now.getTime();
  }

  private composeResolution(
    trust: AvailabilityTrustEvaluation,
    evidence: LiveEvidenceSnapshot | null,
    pending: PendingRequestSnapshot | null,
    now: Date,
  ): PublicAvailabilityResolution {
    const live = this.liveEvidenceResolution(evidence, now);
    if (live) return live;
    if (pending) {
      return {
        requestId: pending.requestId,
        requestStatus: 'PENDING',
        requestedAt: pending.requestedAt,
        expiresAt: pending.expiresAt,
        respondedAt: null,
        availabilityState: baseStateFromTrust(trust.state),
        confirmationSource: null,
        confirmedAt: null,
        retryAfterAt: null,
      };
    }
    return {
      requestId: null,
      requestStatus: 'NONE',
      requestedAt: null,
      expiresAt: null,
      respondedAt: null,
      availabilityState: baseStateFromTrust(trust.state),
      confirmationSource: null,
      confirmedAt: null,
      retryAfterAt: null,
    };
  }

  private liveEvidenceResolution(
    evidence: LiveEvidenceSnapshot | null,
    now: Date,
  ): PublicAvailabilityResolution | null {
    if (evidence === null) return null;
    if (evidence.outcome === 'CHECK_LATER') {
      const retryAfterAt = evidence.retryAfterAt ?? null;
      if (retryAfterAt === null || retryAfterAt.getTime() <= now.getTime()) return null;
      return this.evidenceResolution(evidence, 'CONFIRMATION_REQUIRED', retryAfterAt);
    }
    const validUntil = evidence.validUntil ?? null;
    if (validUntil === null || validUntil.getTime() <= now.getTime()) return null;
    const state: PublicAvailabilityState =
      evidence.outcome === 'AVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE';
    return this.evidenceResolution(evidence, state, null);
  }

  private evidenceResolution(
    evidence: LiveEvidenceSnapshot,
    state: PublicAvailabilityState,
    retryAfterAt: Date | null,
  ): PublicAvailabilityResolution {
    return {
      requestId: evidence.requestId,
      requestStatus: 'RESPONDED',
      requestedAt: null,
      expiresAt: null,
      respondedAt: evidence.confirmedAt,
      availabilityState: state,
      confirmationSource: 'PHARMACY_CONFIRMED',
      confirmedAt: evidence.confirmedAt,
      retryAfterAt,
    };
  }

  private async evaluateTrust(
    tenantId: string,
    providerId: string,
    productId: string,
    now: Date,
    policy: AvailabilityFreshnessPolicy,
  ): Promise<AvailabilityTrustEvaluation> {
    const inventory = await this.prisma.client.inventory.findFirst({
      where: { tenantId, providerId, productId, deletedAt: null },
      select: { id: true },
    });
    if (!inventory) {
      return this.evaluator.evaluateInventory(
        { inventoryId: null, batches: [], evidenceByBatch: new Map() },
        { now, policy },
      );
    }
    const rows = await this.prisma.client.batch.findMany({
      where: { tenantId, providerId, productId, inventoryId: inventory.id },
      select: {
        id: true,
        inventoryId: true,
        productId: true,
        expiryDate: true,
        onHandQuantity: true,
        heldQuantity: true,
        status: true,
        deletedAt: true,
      },
      orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
    });
    const batches: BatchAvailabilityCandidate[] = rows.map((row) => ({
      id: row.id,
      inventoryId: row.inventoryId,
      productId: row.productId,
      expiryDate: row.expiryDate,
      onHandQuantity: row.onHandQuantity,
      heldQuantity: row.heldQuantity,
      status: row.status,
      deletedAt: row.deletedAt,
    }));
    const evidenceByBatch = new Map<string, BatchStockEvidence>();
    if (batches.length > 0) {
      const observations = await this.prisma.client.batchStockObservation.findMany({
        where: { tenantId, batchId: { in: batches.map((batch) => batch.id) } },
        select: { batchId: true, source: true, occurredAt: true, observedOnHandQuantity: true },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      });
      for (const observation of observations) {
        if (evidenceByBatch.has(observation.batchId)) continue;
        evidenceByBatch.set(observation.batchId, {
          source: observation.source,
          observedAt: observation.occurredAt,
          observedOnHandQuantity: observation.observedOnHandQuantity,
        });
      }
    }
    return this.evaluator.evaluateInventory(
      { inventoryId: inventory.id, batches, evidenceByBatch },
      { now, policy },
    );
  }

  /**
   * Returns the newest evidence snapshot for a provider/product (the request
   * -creation flow uses this to short-circuit when valid current evidence
   * already exists). Purely a read of the newest row; validity is judged by
   * callers via isValidLiveState.
   */
  async findCurrentEvidence(
    tenantId: string,
    providerId: string,
    productId: string,
  ): Promise<LiveEvidenceSnapshot | null> {
    return this.loadNewestEvidence(tenantId, providerId, productId);
  }

  private async loadNewestEvidence(
    tenantId: string,
    providerId: string,
    productId: string,
  ): Promise<LiveEvidenceSnapshot | null> {
    const rows = await this.prisma.client.providerProductAvailabilityEvidence.findMany({
      where: { tenantId, providerId, productId },
      select: {
        availabilityRequestId: true,
        outcome: true,
        confirmedAt: true,
        validUntil: true,
        retryAfterAt: true,
      },
      orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
      take: 1,
    });
    const row = rows[0];
    if (!row) return null;
    return {
      requestId: row.availabilityRequestId,
      outcome: row.outcome,
      confirmedAt: row.confirmedAt,
      validUntil: row.validUntil,
      retryAfterAt: row.retryAfterAt,
    };
  }

  private async loadNewestEvidenceForProductIds(
    tenantId: string,
    providerId: string,
    productIds: readonly string[],
  ): Promise<Map<string, LiveEvidenceSnapshot | null>> {
    const rows = await this.prisma.client.providerProductAvailabilityEvidence.findMany({
      where: { tenantId, providerId, productId: { in: [...productIds] } },
      select: {
        productId: true,
        availabilityRequestId: true,
        outcome: true,
        confirmedAt: true,
        validUntil: true,
        retryAfterAt: true,
      },
      orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
    });
    const newest = new Map<string, LiveEvidenceSnapshot | null>();
    for (const row of rows) {
      if (newest.has(row.productId)) continue;
      newest.set(row.productId, {
        requestId: row.availabilityRequestId,
        outcome: row.outcome,
        confirmedAt: row.confirmedAt,
        validUntil: row.validUntil,
        retryAfterAt: row.retryAfterAt,
      });
    }
    for (const productId of productIds) {
      if (!newest.has(productId)) newest.set(productId, null);
    }
    return newest;
  }

  private async loadPendingRequest(
    tenantId: string,
    providerId: string,
    productId: string,
    now: Date,
  ): Promise<PendingRequestSnapshot | null> {
    const row = await this.prisma.client.availabilityRequest.findFirst({
      where: { tenantId, providerId, productId, status: 'PENDING', expiresAt: { gt: now } },
      select: { id: true, requestedAt: true, expiresAt: true },
      orderBy: { requestedAt: 'desc' },
    });
    if (!row) return null;
    return { requestId: row.id, requestedAt: row.requestedAt, expiresAt: row.expiresAt };
  }

  private async loadPendingRequests(
    tenantId: string,
    providerId: string,
    productIds: readonly string[],
    now: Date,
  ): Promise<Map<string, PendingRequestSnapshot | null>> {
    const rows = await this.prisma.client.availabilityRequest.findMany({
      where: {
        tenantId,
        providerId,
        productId: { in: [...productIds] },
        status: 'PENDING',
        expiresAt: { gt: now },
      },
      select: { id: true, productId: true, requestedAt: true, expiresAt: true },
      orderBy: [{ productId: 'asc' }, { requestedAt: 'desc' }],
    });
    const newest = new Map<string, PendingRequestSnapshot | null>();
    for (const row of rows) {
      if (newest.has(row.productId)) continue;
      newest.set(row.productId, {
        requestId: row.id,
        requestedAt: row.requestedAt,
        expiresAt: row.expiresAt,
      });
    }
    for (const productId of productIds) {
      if (!newest.has(productId)) newest.set(productId, null);
    }
    return newest;
  }

  private assertNow(now: Date | undefined): Date {
    const resolved = now ?? new Date();
    if (!Number.isFinite(resolved.getTime())) {
      throw new Error('Live availability resolution clock is invalid');
    }
    return resolved;
  }
}

function subset(
  evidenceByBatch: ReadonlyMap<string, BatchStockEvidence>,
  batches: readonly BatchAvailabilityCandidate[],
): ReadonlyMap<string, BatchStockEvidence> {
  const result = new Map<string, BatchStockEvidence>();
  for (const batch of batches) {
    const evidence = evidenceByBatch.get(batch.id);
    if (evidence) result.set(batch.id, evidence);
  }
  return result;
}

function baseStateFromTrust(state: AvailabilityTrustEvaluation['state']): PublicAvailabilityState {
  switch (state) {
    case 'AVAILABLE':
      return 'AVAILABLE';
    case 'UNAVAILABLE':
      return 'UNAVAILABLE';
    case 'CONFIRMATION_REQUIRED':
      return 'CONFIRMATION_REQUIRED';
    case 'UNKNOWN':
      return 'UNKNOWN';
  }
}
