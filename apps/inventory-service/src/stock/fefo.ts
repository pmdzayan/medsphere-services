import type { FefoAllocation, FefoCandidate } from './stock.types';

export class InsufficientFefoStockError extends Error {
  constructor(
    public readonly requestedQuantity: number,
    public readonly availableQuantity: number,
  ) {
    super('Insufficient eligible stock for FEFO allocation');
    this.name = 'InsufficientFefoStockError';
  }
}

export function planFefoAllocation(
  candidates: readonly FefoCandidate[],
  requestedQuantity: number,
  asOf: Date,
): FefoAllocation[] {
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new Error('Requested FEFO quantity must be a positive safe integer');
  }
  if (Number.isNaN(asOf.getTime())) {
    throw new Error('FEFO as-of date is invalid');
  }

  const eligible = candidates
    .filter(
      (batch) =>
        batch.deletedAt === null &&
        batch.status === 'ACTIVE' &&
        batch.expiryDate.getTime() > asOf.getTime() &&
        batch.onHandQuantity - batch.heldQuantity > 0,
    )
    .sort(compareFefo);

  const allocations: FefoAllocation[] = [];
  let remaining = requestedQuantity;
  let available = 0;

  for (const batch of eligible) {
    const batchAvailable = batch.onHandQuantity - batch.heldQuantity;
    available += batchAvailable;
    if (remaining <= 0) {
      continue;
    }
    const quantity = Math.min(batchAvailable, remaining);
    allocations.push({ batchId: batch.id, inventoryId: batch.inventoryId, quantity });
    remaining -= quantity;
  }

  if (remaining > 0) {
    throw new InsufficientFefoStockError(requestedQuantity, available);
  }
  return allocations;
}

function compareFefo(left: FefoCandidate, right: FefoCandidate): number {
  return (
    left.expiryDate.getTime() - right.expiryDate.getTime() ||
    compareNullableDate(left.manufacturingDate, right.manufacturingDate) ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id)
  );
}

function compareNullableDate(left: Date | null, right: Date | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.getTime() - right.getTime();
}
