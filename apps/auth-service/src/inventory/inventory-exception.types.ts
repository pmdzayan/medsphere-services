import type { AuditRequestContext } from '@medsphere/database';
import type { TrustedInventoryActor } from './inventory-command.types';

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

export interface RecallBatchCommand {
  readonly actor: TrustedInventoryActor;
  readonly providerId: string;
  readonly batchId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly reasonCode: BatchRecallReason;
  readonly reason: string;
  readonly request?: AuditRequestContext;
}

export interface BatchRecallResult {
  readonly batchId: string;
  readonly status: 'RECALLED';
  readonly reasonCode: BatchRecallReason;
  readonly onHandQuantity: number;
  readonly affectedReservationCount: number;
  readonly releasedUnitCount: number;
  readonly resultingBatchVersion: number;
  readonly occurredAt: Date;
  readonly replayed: boolean;
}

export interface RequestInventoryExceptionCommand {
  readonly actor: TrustedInventoryActor;
  readonly providerId: string;
  readonly batchId: string;
  readonly expectedVersion: number;
  readonly action: InventoryExceptionAction;
  readonly quantity?: number;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly request?: AuditRequestContext;
}

export interface InventoryExceptionRequestResult {
  readonly requestId: string;
  readonly providerId: string;
  readonly batchId: string;
  readonly action: InventoryExceptionAction;
  readonly quantity: number | null;
  readonly requestedBatchVersion: number;
  readonly requestedAt: Date;
  readonly replayed: boolean;
}

export interface DecideInventoryExceptionCommand {
  readonly actor: TrustedInventoryActor;
  readonly providerId: string;
  readonly requestId: string;
  readonly outcome: InventoryExceptionDecisionOutcome;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly request?: AuditRequestContext;
}

export interface InventoryExceptionDecisionResult {
  readonly decisionId: string;
  readonly requestId: string;
  readonly providerId: string;
  readonly batchId: string;
  readonly action: InventoryExceptionAction;
  readonly quantity: number | null;
  readonly outcome: InventoryExceptionDecisionOutcome;
  readonly movementId: string | null;
  readonly onHandBefore: number | null;
  readonly onHandAfter: number | null;
  readonly resultingBatchVersion: number | null;
  readonly occurredAt: Date;
  readonly replayed: boolean;
}
