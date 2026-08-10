import type { AuditRequestContext } from '@medsphere/database';
import type { TrustedInventoryActor } from './inventory-command.types';

export const BATCH_QUARANTINE_REASONS = [
  'QUALITY_SUSPECT',
  'TEMPERATURE_EXCURSION',
  'PACKAGING_COMPROMISED',
  'STORAGE_DEVIATION',
] as const;

export type BatchQuarantineReason = (typeof BATCH_QUARANTINE_REASONS)[number];

export interface QuarantineBatchCommand {
  readonly actor: TrustedInventoryActor;
  readonly providerId: string;
  readonly batchId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly reasonCode: BatchQuarantineReason;
  readonly request?: AuditRequestContext;
}

export interface BatchQuarantineResult {
  readonly batchId: string;
  readonly status: 'QUARANTINED';
  readonly reasonCode: BatchQuarantineReason;
  readonly onHandQuantity: number;
  readonly affectedReservationCount: number;
  readonly releasedUnitCount: number;
  readonly resultingBatchVersion: number;
  readonly occurredAt: Date;
  readonly replayed: boolean;
}
