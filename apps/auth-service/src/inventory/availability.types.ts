/**
 * Task 0025 - Medicine availability trust & inventory freshness foundation.
 *
 * Canonical availability-trust contract. One typed contract supports every
 * availability claim the platform will later expose (patient medicine search,
 * Live Availability Request reconciliation, pharmacist confirmation, POS
 * synchronization, analytics, trust metrics). Internal consumers must use
 * this contract and the canonical evaluator rather than independently
 * rederiving freshness rules.
 *
 * The accepted Batch model remains the only quantity authority. This
 * contract adds physical-stock observation evidence (what was objectively
 * seen and when), a V1 freshness policy, and a trust interpretation. It
 * never introduces a second quantity source.
 */

export const AVAILABILITY_TRUST_STATES = [
  'AVAILABLE',
  'UNAVAILABLE',
  'CONFIRMATION_REQUIRED',
  'UNKNOWN',
] as const;

export type AvailabilityTrustState = (typeof AVAILABILITY_TRUST_STATES)[number];

/**
 * Closed catalogue of accepted BATCH-BOUND physical-stock evidence sources.
 *
 * Every value in this catalogue is persisted in `BatchStockObservation`, which
 * is strictly batch-bound (it requires an AIM `Batch` id via composite FKs).
 * Therefore:
 * - `AIM_MANAGED_INVENTORY` is the only live write path in Task 0025.
 * - `MANUAL_PHYSICAL_COUNT` and `POS_SYNC` are valid ONLY when the external
 *   observation has been normalized to a real AIM batch before it is written
 *   here. They are contract slots, not claims that this table can be backfilled
 *   from arbitrary external data without an AIM batch.
 *
 * `PHARMACIST_CONFIRMATION` is DELIBERATELY ABSENT from this catalogue: a
 * pharmacist confirmation for Live Availability Request is temporary
 * provider/product availability evidence and must NOT require an AIM batch to
 * exist merely to record the confirmation. It is reserved for a future
 * provider/product-level evidence model that the canonical trust layer can
 * combine without redesigning the batch-bound freshness/trust rules.
 *
 * Unvalidated free-form source strings are never accepted anywhere in the
 * evidence path.
 */
export const AVAILABILITY_EVIDENCE_SOURCES = [
  'AIM_MANAGED_INVENTORY',
  'MANUAL_PHYSICAL_COUNT',
  'POS_SYNC',
] as const;

export type AvailabilityEvidenceSource = (typeof AVAILABILITY_EVIDENCE_SOURCES)[number];

/**
 * Reserved, non-batch-bound source for future provider/product-level live
 * evidence (e.g. Live Availability Request pharmacist confirmation). Never
 * written to `BatchStockObservation`; a future evidence model will carry it.
 */
export const AVAILABILITY_RESERVED_PROVIDER_PRODUCT_EVIDENCE_SOURCES = [
  'PHARMACIST_CONFIRMATION',
] as const;

/** Sources with an accepted live write path in Task 0025. */
export const AVAILABILITY_ACCEPTED_COMMAND_SOURCES = ['AIM_MANAGED_INVENTORY'] as const;

export type AvailabilityAcceptedCommandSource =
  (typeof AVAILABILITY_ACCEPTED_COMMAND_SOURCES)[number];

/**
 * Freshness classification of observation-borne evidence:
 * - FRESH falls within the accepted V1 freshness window (including exactly
 *   at the boundary).
 * - STALE is older than the accepted V1 freshness window.
 * - INVALID is an implausible timestamp (non-finite or beyond the accepted
 *   clock-skew tolerance) that must fail closed (never yields AVAILABLE).
 * - MISSING means no observation evidence exists at all.
 */
export const AVAILABILITY_FRESHNESS_CLASSIFICATIONS = [
  'FRESH',
  'STALE',
  'INVALID',
  'MISSING',
] as const;

export type AvailabilityFreshnessClassification =
  (typeof AVAILABILITY_FRESHNESS_CLASSIFICATIONS)[number];

/** Machine-readable result reason. Never user-facing text. */
export const AVAILABILITY_TRUST_REASON_CODES = [
  'ELIGIBLE_QUANTITY_FRESH',
  'ELIGIBLE_QUANTITY_STALE',
  'NO_OBSERVATION',
  'NO_ELIGIBLE_QUANTITY',
  'NO_BATCH_EVIDENCE',
  'NO_INVENTORY',
  'INVALID_OBSERVATION_TIMESTAMP',
] as const;

export type AvailabilityTrustReasonCode = (typeof AVAILABILITY_TRUST_REASON_CODES)[number];

/** Batch snapshot consumed by the canonical evaluator; mirrors the accepted
 * eligibility fields ReservationCreationService and FEFO use. */
export interface BatchAvailabilityCandidate {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly expiryDate: Date;
  readonly onHandQuantity: number;
  readonly heldQuantity: number;
  readonly status: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'QUARANTINED';
  readonly deletedAt: Date | null;
}

/** The newest physical-stock observation evidence governing a batch. */
export interface BatchStockEvidence {
  readonly source: AvailabilityEvidenceSource;
  readonly observedAt: Date;
  readonly observedOnHandQuantity: number;
}

/** Batch-level trust classification (internal transparency only). */
export interface BatchTrustEvaluation {
  readonly batchId: string;
  readonly eligibleAvailableQuantity: number;
  readonly evidence: BatchStockEvidence | null;
  readonly freshness: AvailabilityFreshnessClassification;
}

/**
 * Canonical product/provider availability-trust evaluation result.
 *
 * availableQuantity is the eligible available quantity per the accepted
 * inventory/reservation model (Batch onHand minus reservation-held quantity,
 * restricted to ACTIVE non-expired non-deleted batches). It is an internal
 * contract value for reconciliation and future flows; public patient surfaces
 * must not expose raw quantities.
 */
export interface AvailabilityTrustEvaluation {
  readonly inventoryId: string | null;
  readonly state: AvailabilityTrustState;
  readonly availableQuantity: number;
  readonly reasonCode: AvailabilityTrustReasonCode;
  readonly freshness: AvailabilityFreshnessClassification;
  readonly evidence: BatchStockEvidence | null;
  readonly batchEvaluations: readonly BatchTrustEvaluation[];
}

/** Pure evaluator input: batch snapshots plus currently-active evidence by batch. */
export interface EvaluateInventoryTrustInput {
  readonly inventoryId: string | null;
  readonly batches: readonly BatchAvailabilityCandidate[];
  readonly evidenceByBatch: ReadonlyMap<string, BatchStockEvidence>;
}
