import type { AuditRequestContext } from '@medsphere/database';
import type { TrustedInventoryActor } from './inventory-command.types';
export interface RecordCompletedTransferCommand {
  readonly actor: TrustedInventoryActor;
  readonly sourceProviderId: string;
  readonly destinationProviderId: string;
  readonly sourceBatchId: string;
  readonly expectedSourceVersion: number;
  readonly quantity: number;
  readonly idempotencyKey: string;
  readonly reason?: string;
  readonly request?: AuditRequestContext;
}
export interface CompletedTransferResult {
  readonly transferId: string;
  readonly productId: string;
  readonly sourceProviderId: string;
  readonly destinationProviderId: string;
  readonly sourceInventoryId: string;
  readonly destinationInventoryId: string;
  readonly sourceBatchId: string;
  readonly destinationBatchId: string;
  readonly sourceMovementId: string;
  readonly destinationMovementId: string;
  readonly quantity: number;
  readonly sourceOnHandAfter: number;
  readonly destinationOnHandAfter: number;
  readonly sourceBatchVersion: number;
  readonly destinationBatchVersion: number;
  readonly completedAt: Date;
  readonly replayed: boolean;
}
