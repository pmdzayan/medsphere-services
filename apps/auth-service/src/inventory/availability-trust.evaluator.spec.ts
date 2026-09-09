/**
 * Task 0025 - Canonical availability-trust evaluator unit tests.
 *
 * Pure/deterministic: all clocks and policies are injected. Covers the full
 * trust-classification matrix, freshness gates, safety-state precedence, and
 * the absence of a second quantity authority.
 */
import { DEFAULT_AVAILABILITY_FRESHNESS_POLICY } from './availability-freshness-policy';
import {
  AvailabilityTrustEvaluator,
  type TrustEvaluationClock,
} from './availability-trust.evaluator';
import type {
  BatchAvailabilityCandidate,
  BatchStockEvidence,
  EvaluateInventoryTrustInput,
} from './availability.types';

const evaluator = new AvailabilityTrustEvaluator();

const NOW = new Date('2026-09-10T12:00:00.000Z');

function clock(now: Date = NOW): TrustEvaluationClock {
  return { now, policy: DEFAULT_AVAILABILITY_FRESHNESS_POLICY };
}

function batch(overrides: Partial<BatchAvailabilityCandidate> = {}): BatchAvailabilityCandidate {
  return {
    id: 'batch-1',
    inventoryId: 'inventory-1',
    productId: 'product-1',
    expiryDate: new Date('2027-12-31T00:00:00.000Z'),
    onHandQuantity: 20,
    heldQuantity: 0,
    status: 'ACTIVE',
    deletedAt: null,
    ...overrides,
  };
}

function evidence(overrides: Partial<BatchStockEvidence> = {}): BatchStockEvidence {
  return {
    source: 'AIM_MANAGED_INVENTORY',
    observedAt: NOW,
    observedOnHandQuantity: 20,
    ...overrides,
  };
}

function input(
  batches: readonly BatchAvailabilityCandidate[],
  evidenceByBatch: ReadonlyMap<string, BatchStockEvidence> = new Map(),
  inventoryId: string | null = 'inventory-1',
): EvaluateInventoryTrustInput {
  return { inventoryId, batches, evidenceByBatch };
}
describe('Task 0025 AvailabilityTrustEvaluator', () => {
  describe('trust classification', () => {
    it('fresh evidence + positive eligible quantity -> AVAILABLE', () => {
      const result = evaluator.evaluateInventory(
        input([batch()], new Map([['batch-1', evidence()]])),
        clock(),
      );
      expect(result.state).toBe('AVAILABLE');
      expect(result.reasonCode).toBe('ELIGIBLE_QUANTITY_FRESH');
      expect(result.availableQuantity).toBe(20);
    });

    it('stale evidence + positive eligible quantity -> CONFIRMATION_REQUIRED', () => {
      const stale = evidence({ observedAt: new Date(NOW.getTime() - 48 * 3_600_000) });
      const result = evaluator.evaluateInventory(
        input([batch()], new Map([['batch-1', stale]])),
        clock(),
      );
      expect(result.state).toBe('CONFIRMATION_REQUIRED');
      expect(result.reasonCode).toBe('ELIGIBLE_QUANTITY_STALE');
      expect(result.availableQuantity).toBe(20);
    });

    it('no observation evidence -> UNKNOWN', () => {
      const result = evaluator.evaluateInventory(input([batch()]), clock());
      expect(result.state).toBe('UNKNOWN');
      expect(result.reasonCode).toBe('NO_OBSERVATION');
      expect(result.availableQuantity).toBe(20);
    });

    it('no batches at all -> UNKNOWN (never confirmed unavailability from empty listing)', () => {
      const result = evaluator.evaluateInventory(input([], new Map(), 'inventory-1'), clock());
      expect(result.state).toBe('UNKNOWN');
      expect(result.reasonCode).toBe('NO_BATCH_EVIDENCE');
    });

    it('no inventory row at all -> UNKNOWN', () => {
      const result = evaluator.evaluateInventory(input([], new Map(), null), clock());
      expect(result.state).toBe('UNKNOWN');
      expect(result.reasonCode).toBe('NO_INVENTORY');
    });

    it('zero available quantity -> UNAVAILABLE even with fresh evidence', () => {
      const result = evaluator.evaluateInventory(
        input([batch({ onHandQuantity: 0, heldQuantity: 0 })], new Map([['batch-1', evidence()]])),
        clock(),
      );
      expect(result.state).toBe('UNAVAILABLE');
      expect(result.reasonCode).toBe('NO_ELIGIBLE_QUANTITY');
      expect(result.availableQuantity).toBe(0);
    });

    it('expired-only stock -> UNAVAILABLE even with fresh evidence', () => {
      const expiredOnly = evaluator.evaluateInventory(
        input(
          [batch({ id: 'batch-exp', status: 'EXPIRED', onHandQuantity: 10 })],
          new Map([['batch-exp', evidence()]]),
        ),
        clock(),
      );
      expect(expiredOnly.state).toBe('UNAVAILABLE');
      expect(expiredOnly.availableQuantity).toBe(0);
    });

    it('quarantined-only stock -> UNAVAILABLE even with fresh evidence', () => {
      const result = evaluator.evaluateInventory(
        input(
          [batch({ id: 'batch-q', status: 'QUARANTINED', onHandQuantity: 10 })],
          new Map([['batch-q', evidence()]]),
        ),
        clock(),
      );
      expect(result.state).toBe('UNAVAILABLE');
      expect(result.availableQuantity).toBe(0);
    });

    it('held reservation quantity reduces the trusted available quantity', () => {
      const batchWithHeld = batch({ onHandQuantity: 20, heldQuantity: 8 });
      const result = evaluator.evaluateInventory(
        input([batchWithHeld], new Map([['batch-1', evidence()]])),
        clock(),
      );
      expect(result.state).toBe('AVAILABLE');
      expect(result.availableQuantity).toBe(12);
    });

    it('fully-held stock is UNAVAILABLE even when evidence is fresh', () => {
      const result = evaluator.evaluateInventory(
        input(
          [batch({ onHandQuantity: 20, heldQuantity: 20 })],
          new Map([['batch-1', evidence()]]),
        ),
        clock(),
      );
      expect(result.state).toBe('UNAVAILABLE');
      expect(result.availableQuantity).toBe(0);
    });
  });
  describe('freshness never overrides safety exclusions', () => {
    it('fresh evidence cannot make an ineligible batch contribute AVAILABLE', () => {
      const result = evaluator.evaluateInventory(
        input(
          [batch({ id: 'batch-expired', status: 'EXPIRED' })],
          new Map([['batch-expired', evidence({ observedAt: NOW, observedOnHandQuantity: 99 })]]),
        ),
        clock(),
      );
      expect(result.state).toBe('UNAVAILABLE');
      expect(result.availableQuantity).toBe(0);
    });

    it('deleted batches are never eligible even with fresh evidence', () => {
      const result = evaluator.evaluateInventory(
        input(
          [batch({ id: 'batch-deleted', deletedAt: NOW })],
          new Map([['batch-deleted', evidence()]]),
        ),
        clock(),
      );
      expect(result.state).toBe('UNAVAILABLE');
      expect(result.availableQuantity).toBe(0);
    });
  });

  describe('invalid/future timestamps in evidence', () => {
    it('implausibly-future evidence fails closed to UNKNOWN, never AVAILABLE', () => {
      const future = evidence({ observedAt: new Date(NOW.getTime() + 2 * 3_600_000) });
      const result = evaluator.evaluateInventory(
        input([batch()], new Map([['batch-1', future]])),
        clock(),
      );
      expect(result.state).toBe('UNKNOWN');
      expect(result.reasonCode).toBe('INVALID_OBSERVATION_TIMESTAMP');
      expect(result.freshness).toBe('INVALID');
    });
  });

  describe('newest-evidence precedence across batches', () => {
    it('uses the newest evidence among eligible batches for the freshness claim', () => {
      const result = evaluator.evaluateInventory(
        input(
          [batch({ id: 'batch-a' }), batch({ id: 'batch-b' })],
          new Map([
            ['batch-a', evidence({ observedAt: new Date(NOW.getTime() - 72 * 3_600_000) })],
            ['batch-b', evidence()],
          ]),
        ),
        clock(),
      );
      expect(result.state).toBe('AVAILABLE');
      expect(result.evidence?.observedAt.getTime()).toBe(NOW.getTime());
    });

    it('stale newest evidence among eligible batches yields CONFIRMATION_REQUIRED', () => {
      const result = evaluator.evaluateInventory(
        input(
          [batch({ id: 'batch-a' }), batch({ id: 'batch-b' })],
          new Map([
            ['batch-a', evidence({ observedAt: new Date(NOW.getTime() - 72 * 3_600_000) })],
            ['batch-b', evidence({ observedAt: new Date(NOW.getTime() - 48 * 3_600_000) })],
          ]),
        ),
        clock(),
      );
      expect(result.state).toBe('CONFIRMATION_REQUIRED');
    });
  });

  describe('batch granularity', () => {
    it('exposes per-batch eligibility and freshness', () => {
      const result = evaluator.evaluateInventory(
        input(
          [batch({ id: 'batch-fresh' }), batch({ id: 'batch-stale', heldQuantity: 5 })],
          new Map([
            ['batch-fresh', evidence()],
            ['batch-stale', evidence({ observedAt: new Date(NOW.getTime() - 25 * 3_600_000) })],
          ]),
        ),
        clock(),
      );
      const fresh = result.batchEvaluations.find((b) => b.batchId === 'batch-fresh');
      const stale = result.batchEvaluations.find((b) => b.batchId === 'batch-stale');
      expect(fresh?.eligibleAvailableQuantity).toBe(20);
      expect(fresh?.freshness).toBe('FRESH');
      expect(stale?.eligibleAvailableQuantity).toBe(15);
      expect(stale?.freshness).toBe('STALE');
    });
  });

  describe('invalid clock', () => {
    it('rejects an invalid evaluation clock', () => {
      const badClock = { now: new Date(Number.NaN), policy: DEFAULT_AVAILABILITY_FRESHNESS_POLICY };
      expect(() => evaluator.evaluateInventory(input([batch()]), badClock)).toThrow(
        'clock is invalid',
      );
    });
  });
});
