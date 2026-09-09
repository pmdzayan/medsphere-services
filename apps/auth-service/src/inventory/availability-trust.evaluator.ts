/**
 * Task 0025 - Canonical availability-trust evaluator.
 *
 * Single reusable domain evaluator. Future public medicine search, Live
 * Availability Request reconciliation, pharmacy analytics, and trust metrics
 * must all consume this evaluator (or the AvailabilityTrustService read path
 * wrapping it) rather than rederiving freshness/eligibility rules
 * independently.
 *
 * The evaluator is pure and deterministic: all clocks and policies are
 * injected; nothing is hard-coded here. It reads quantities ONLY from the
 * accepted Batch authority snapshot passed in, and applies the exact same
 * stock-eligibility semantics ReservationCreationService / FEFO use (ACTIVE,
 * non-expired, non-deleted batches; onHand minus held). It never introduces
 * a second quantity authority. Reservation-held quantity therefore keeps
 * reducing the trusted available quantity exactly as the accepted
 * reservation model demands.
 *
 * Safety-state precedence: a freshly observed batch that subsequently becomes
 * expired, quarantined, exhausted, deleted, or otherwise ineligible can never
 * remain AVAILABLE; ineligibility yields a 0 eligible quantity contribution.
 */
import { Injectable } from '@nestjs/common';
import {
  classifyObservationFreshness,
  type AvailabilityFreshnessPolicy,
} from './availability-freshness-policy';
import type {
  AvailabilityFreshnessClassification,
  AvailabilityTrustEvaluation,
  AvailabilityTrustReasonCode,
  AvailabilityTrustState,
  BatchAvailabilityCandidate,
  BatchStockEvidence,
  BatchTrustEvaluation,
  EvaluateInventoryTrustInput,
} from './availability.types';

export interface TrustEvaluationClock {
  readonly now: Date;
  readonly policy: AvailabilityFreshnessPolicy;
}

@Injectable()
export class AvailabilityTrustEvaluator {
  evaluateInventory(
    input: EvaluateInventoryTrustInput,
    clock: TrustEvaluationClock,
  ): AvailabilityTrustEvaluation {
    this.assertValidClock(clock);
    const batchEvaluations = input.batches.map((batch) =>
      this.evaluateBatch(batch, input.evidenceByBatch.get(batch.id) ?? null, clock),
    );
    const eligibleBatches = batchEvaluations.filter((batch) => batch.eligibleAvailableQuantity > 0);
    const availableQuantity = eligibleBatches.reduce(
      (total, batch) => total + batch.eligibleAvailableQuantity,
      0,
    );

    // No inventory row at all: no trustworthy evidence either way.
    if (input.inventoryId === null) {
      return this.result(
        'UNKNOWN',
        0,
        'NO_INVENTORY',
        'MISSING',
        null,
        batchEvaluations,
        input.inventoryId,
      );
    }

    // Inventory exists but zero batch rows: no quantity-authority evidence. We
    // must not claim confirmed unavailability (nor availability) from an empty
    // listing; UNKNOWN is the conservative state.
    if (batchEvaluations.length === 0) {
      return this.result(
        'UNKNOWN',
        0,
        'NO_BATCH_EVIDENCE',
        'MISSING',
        null,
        batchEvaluations,
        input.inventoryId,
      );
    }

    // Zero eligible available quantity (expired-only, quarantined-only,
    // exhausted, held-out, or otherwise ineligible stock) is UNAVAILABLE.
    // Freshness never overrides a safety exclusion: evidence is not consulted
    // at all in this branch.
    if (eligibleBatches.length === 0) {
      return this.result(
        'UNAVAILABLE',
        0,
        'NO_ELIGIBLE_QUANTITY',
        'MISSING',
        null,
        batchEvaluations,
        input.inventoryId,
      );
    }

    // Positive eligible quantity exists. Freshness gates the public claim: the
    // newest evidence among the sellable (eligible) batches decides whether the
    // stock evidence is fresh enough for AVAILABLE, too old for a public claim
    // (CONFIRMATION_REQUIRED), or absent (UNKNOWN).
    const evidenced = eligibleBatches
      .filter((batch) => batch.evidence !== null)
      .map((batch) => ({ batchId: batch.batchId, evidence: batch.evidence as BatchStockEvidence }));
    if (evidenced.length === 0) {
      return this.result(
        'UNKNOWN',
        availableQuantity,
        'NO_OBSERVATION',
        'MISSING',
        null,
        batchEvaluations,
        input.inventoryId,
      );
    }
    evidenced.sort(
      (left, right) =>
        right.evidence.observedAt.getTime() - left.evidence.observedAt.getTime() ||
        left.batchId.localeCompare(right.batchId),
    );
    const newest = evidenced[0];
    const classification = classifyObservationFreshness(
      newest.evidence.observedAt,
      clock.now,
      clock.policy,
    );
    switch (classification) {
      case 'FRESH':
        return this.result(
          'AVAILABLE',
          availableQuantity,
          'ELIGIBLE_QUANTITY_FRESH',
          'FRESH',
          newest.evidence,
          batchEvaluations,
          input.inventoryId,
        );
      case 'STALE':
        return this.result(
          'CONFIRMATION_REQUIRED',
          availableQuantity,
          'ELIGIBLE_QUANTITY_STALE',
          'STALE',
          newest.evidence,
          batchEvaluations,
          input.inventoryId,
        );
      case 'INVALID':
        return this.result(
          'UNKNOWN',
          availableQuantity,
          'INVALID_OBSERVATION_TIMESTAMP',
          'INVALID',
          newest.evidence,
          batchEvaluations,
          input.inventoryId,
        );
    }
  }
  /** Batch-level classification (transparency for callers needing batch granularity). */
  evaluateBatch(
    batch: BatchAvailabilityCandidate,
    evidence: BatchStockEvidence | null,
    clock: TrustEvaluationClock,
  ): BatchTrustEvaluation {
    const freshness = this.classifyBatchEvidence(evidence, clock);
    return {
      batchId: batch.id,
      eligibleAvailableQuantity: this.eligibleAvailableQuantity(batch, clock.now),
      evidence,
      freshness,
    };
  }

  private classifyBatchEvidence(
    evidence: BatchStockEvidence | null,
    clock: TrustEvaluationClock,
  ): AvailabilityFreshnessClassification {
    if (evidence === null) return 'MISSING';
    return classifyObservationFreshness(evidence.observedAt, clock.now, clock.policy);
  }

  private eligibleAvailableQuantity(batch: BatchAvailabilityCandidate, now: Date): number {
    const isEligible =
      batch.deletedAt === null &&
      batch.status === 'ACTIVE' &&
      batch.expiryDate.getTime() > now.getTime();
    if (!isEligible) return 0;
    const available = batch.onHandQuantity - batch.heldQuantity;
    if (!Number.isSafeInteger(available)) return 0;
    return Math.max(0, available);
  }

  private result(
    state: AvailabilityTrustState,
    availableQuantity: number,
    reasonCode: AvailabilityTrustReasonCode,
    freshness: AvailabilityFreshnessClassification,
    evidence: BatchStockEvidence | null,
    batchEvaluations: readonly BatchTrustEvaluation[],
    inventoryId: string | null,
  ): AvailabilityTrustEvaluation {
    return {
      inventoryId,
      state,
      availableQuantity,
      reasonCode,
      freshness,
      evidence,
      batchEvaluations,
    };
  }

  private assertValidClock(clock: TrustEvaluationClock): void {
    if (Number.isNaN(clock.now.getTime())) {
      throw new Error('Availability trust evaluation clock is invalid');
    }
  }
}
