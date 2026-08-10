import type { AuditRequestContext } from '@medsphere/database';
import type { TrustedInventoryActor } from './inventory-command.types';

export interface RecordDamagedStockCommand {
  readonly actor: TrustedInventoryActor;
  readonly providerId: string;
  readonly batchId: string;
  readonly expectedVersion: number;
  readonly quantity: number;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly request?: AuditRequestContext;
}

export interface DamagedStockResult {
  readonly providerId: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly batchId: string;
  readonly movementId: string;
  readonly quantity: number;
  readonly onHandBefore: number;
  readonly onHandAfter: number;
  readonly resultingBatchVersion: number;
  readonly occurredAt: Date;
  readonly replayed: boolean;
}
