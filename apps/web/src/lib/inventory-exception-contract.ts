import { isCanonicalUuid } from './inventory-contract';

export const BATCH_RECALL_REASONS = [
  'MANUFACTURER_RECALL',
  'REGULATORY_RECALL',
  'QUALITY_ALERT',
  'OTHER',
] as const;
export type BatchRecallReason = (typeof BATCH_RECALL_REASONS)[number];

export const INVENTORY_EXCEPTION_ACTIONS = [
  'QUARANTINE_RELEASE',
  'DISPOSAL',
  'SUPPLIER_RETURN',
] as const;
export type InventoryExceptionAction = (typeof INVENTORY_EXCEPTION_ACTIONS)[number];

export const INVENTORY_EXCEPTION_DECISIONS = ['APPROVED', 'REJECTED'] as const;
export type InventoryExceptionDecisionOutcome = (typeof INVENTORY_EXCEPTION_DECISIONS)[number];

export interface RecallBatchRequest {
  expectedVersion: number;
  idempotencyKey: string;
  reasonCode: BatchRecallReason;
  reason: string;
}

export interface BatchRecallResponse {
  batchId: string;
  status: 'RECALLED';
  reasonCode: BatchRecallReason;
  onHandQuantity: number;
  affectedReservationCount: number;
  releasedUnitCount: number;
  resultingBatchVersion: number;
  occurredAt: string;
  replayed: boolean;
}

export interface InventoryExceptionRequest {
  batchId: string;
  expectedVersion: number;
  action: InventoryExceptionAction;
  quantity?: number;
  idempotencyKey: string;
  reason: string;
}

export interface InventoryExceptionRequestResponse {
  requestId: string;
  providerId: string;
  batchId: string;
  action: InventoryExceptionAction;
  quantity: number | null;
  requestedBatchVersion: number;
  requestedAt: string;
  replayed: boolean;
}

export interface InventoryExceptionDecisionRequest {
  outcome: InventoryExceptionDecisionOutcome;
  idempotencyKey: string;
  reason: string;
}

export interface InventoryExceptionDecisionResponse {
  decisionId: string;
  requestId: string;
  providerId: string;
  batchId: string;
  action: InventoryExceptionAction;
  quantity: number | null;
  outcome: InventoryExceptionDecisionOutcome;
  movementId: string | null;
  onHandBefore: number | null;
  onHandAfter: number | null;
  resultingBatchVersion: number | null;
  occurredAt: string;
  replayed: boolean;
}

export function isRecallBatchRequest(value: unknown): value is RecallBatchRequest {
  if (!hasExactKeys(value, ['expectedVersion', 'idempotencyKey', 'reasonCode', 'reason'])) {
    return false;
  }
  const v = value as Partial<RecallBatchRequest>;
  return (
    integer(v.expectedVersion, 1, 2_147_483_647) &&
    trimmed(v.idempotencyKey, 8, 120) &&
    BATCH_RECALL_REASONS.includes(v.reasonCode as BatchRecallReason) &&
    trimmed(v.reason, 1, 500)
  );
}

export function isBatchRecallResponse(value: unknown): value is BatchRecallResponse {
  if (
    !hasExactKeys(value, [
      'batchId',
      'status',
      'reasonCode',
      'onHandQuantity',
      'affectedReservationCount',
      'releasedUnitCount',
      'resultingBatchVersion',
      'occurredAt',
      'replayed',
    ])
  ) {
    return false;
  }
  const v = value as Partial<BatchRecallResponse>;
  return (
    isCanonicalUuid(v.batchId) &&
    v.status === 'RECALLED' &&
    BATCH_RECALL_REASONS.includes(v.reasonCode as BatchRecallReason) &&
    integer(v.onHandQuantity, 0, 2_147_483_647) &&
    integer(v.affectedReservationCount, 0, 2_147_483_647) &&
    integer(v.releasedUnitCount, 0, 2_147_483_647) &&
    integer(v.resultingBatchVersion, 1, 2_147_483_647) &&
    iso(v.occurredAt) &&
    typeof v.replayed === 'boolean'
  );
}

export function isInventoryExceptionRequest(value: unknown): value is InventoryExceptionRequest {
  if (
    !hasOnlyKeys(value, [
      'batchId',
      'expectedVersion',
      'action',
      'quantity',
      'idempotencyKey',
      'reason',
    ]) ||
    !requiredKeys(value, ['batchId', 'expectedVersion', 'action', 'idempotencyKey', 'reason'])
  ) {
    return false;
  }
  const v = value as Partial<InventoryExceptionRequest>;
  if (
    !isCanonicalUuid(v.batchId) ||
    !integer(v.expectedVersion, 1, 2_147_483_647) ||
    !INVENTORY_EXCEPTION_ACTIONS.includes(v.action as InventoryExceptionAction) ||
    !trimmed(v.idempotencyKey, 8, 120) ||
    !trimmed(v.reason, 1, 500)
  ) {
    return false;
  }
  if (v.action === 'QUARANTINE_RELEASE') return v.quantity === undefined;
  return integer(v.quantity, 1, 2_147_483_647);
}

export function isInventoryExceptionRequestResponse(
  value: unknown,
): value is InventoryExceptionRequestResponse {
  if (
    !hasExactKeys(value, [
      'requestId',
      'providerId',
      'batchId',
      'action',
      'quantity',
      'requestedBatchVersion',
      'requestedAt',
      'replayed',
    ])
  ) {
    return false;
  }
  const v = value as Partial<InventoryExceptionRequestResponse>;
  return (
    isCanonicalUuid(v.requestId) &&
    isCanonicalUuid(v.providerId) &&
    isCanonicalUuid(v.batchId) &&
    INVENTORY_EXCEPTION_ACTIONS.includes(v.action as InventoryExceptionAction) &&
    (v.quantity === null || integer(v.quantity, 1, 2_147_483_647)) &&
    (v.action === 'QUARANTINE_RELEASE' ? v.quantity === null : v.quantity !== null) &&
    integer(v.requestedBatchVersion, 1, 2_147_483_647) &&
    iso(v.requestedAt) &&
    typeof v.replayed === 'boolean'
  );
}

export function isInventoryExceptionDecisionRequest(
  value: unknown,
): value is InventoryExceptionDecisionRequest {
  if (!hasExactKeys(value, ['outcome', 'idempotencyKey', 'reason'])) return false;
  const v = value as Partial<InventoryExceptionDecisionRequest>;
  return (
    INVENTORY_EXCEPTION_DECISIONS.includes(v.outcome as InventoryExceptionDecisionOutcome) &&
    trimmed(v.idempotencyKey, 8, 120) &&
    trimmed(v.reason, 1, 500)
  );
}

export function isInventoryExceptionDecisionResponse(
  value: unknown,
): value is InventoryExceptionDecisionResponse {
  if (
    !hasExactKeys(value, [
      'decisionId',
      'requestId',
      'providerId',
      'batchId',
      'action',
      'quantity',
      'outcome',
      'movementId',
      'onHandBefore',
      'onHandAfter',
      'resultingBatchVersion',
      'occurredAt',
      'replayed',
    ])
  ) {
    return false;
  }
  const v = value as Partial<InventoryExceptionDecisionResponse>;
  if (
    !isCanonicalUuid(v.decisionId) ||
    !isCanonicalUuid(v.requestId) ||
    !isCanonicalUuid(v.providerId) ||
    !isCanonicalUuid(v.batchId) ||
    !INVENTORY_EXCEPTION_ACTIONS.includes(v.action as InventoryExceptionAction) ||
    (v.quantity !== null && !integer(v.quantity, 1, 2_147_483_647)) ||
    !INVENTORY_EXCEPTION_DECISIONS.includes(v.outcome as InventoryExceptionDecisionOutcome) ||
    !iso(v.occurredAt) ||
    typeof v.replayed !== 'boolean'
  ) {
    return false;
  }
  if (v.outcome === 'REJECTED') {
    return (
      v.movementId === null &&
      v.onHandBefore === null &&
      v.onHandAfter === null &&
      v.resultingBatchVersion === null
    );
  }
  return (
    (v.movementId === null || isCanonicalUuid(v.movementId)) &&
    integer(v.onHandBefore, 0, 2_147_483_647) &&
    integer(v.onHandAfter, 0, 2_147_483_647) &&
    integer(v.resultingBatchVersion, 1, 2_147_483_647) &&
    (v.action === 'QUARANTINE_RELEASE'
      ? v.movementId === null && v.onHandBefore === v.onHandAfter
      : isCanonicalUuid(v.movementId))
  );
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function hasOnlyKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function requiredKeys(value: unknown, keys: readonly string[]): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function trimmed(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    value.length >= min &&
    value.length <= max
  );
}

function integer(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function iso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}
