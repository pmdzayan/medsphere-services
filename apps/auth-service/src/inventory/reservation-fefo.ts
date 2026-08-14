export interface ReservationFefoCandidate {
  readonly id: string;
  readonly inventoryId: string;
  readonly expiryDate: Date;
  readonly manufacturingDate: Date | null;
  readonly onHandQuantity: number;
  readonly heldQuantity: number;
  readonly createdAt: Date;
}

export interface ReservationFefoAllocation {
  readonly batchId: string;
  readonly inventoryId: string;
  readonly quantity: number;
}

export class InsufficientReservationStockError extends Error {
  constructor() {
    super('Insufficient eligible stock for reservation');
    this.name = 'InsufficientReservationStockError';
  }
}

export function planReservationFefo(
  candidates: readonly ReservationFefoCandidate[],
  requestedQuantity: number,
): ReservationFefoAllocation[] {
  const eligible = [...candidates]
    .filter(({ onHandQuantity, heldQuantity }) => onHandQuantity > heldQuantity)
    .sort(
      (left, right) =>
        left.expiryDate.getTime() - right.expiryDate.getTime() ||
        compareNullableDate(left.manufacturingDate, right.manufacturingDate) ||
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id),
    );

  const allocations: ReservationFefoAllocation[] = [];
  let remaining = requestedQuantity;
  for (const batch of eligible) {
    if (remaining === 0) break;
    const quantity = Math.min(batch.onHandQuantity - batch.heldQuantity, remaining);
    allocations.push({ batchId: batch.id, inventoryId: batch.inventoryId, quantity });
    remaining -= quantity;
  }
  if (remaining !== 0) throw new InsufficientReservationStockError();
  return allocations;
}

function compareNullableDate(left: Date | null, right: Date | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.getTime() - right.getTime();
}
