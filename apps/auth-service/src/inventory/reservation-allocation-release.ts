import { ConflictException } from '@nestjs/common';
import { Prisma, SerializableRetryError } from '@medsphere/database';

export interface HeldReservationAllocation {
  readonly id: string;
  readonly inventoryId: string;
  readonly batchId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly batch: {
    readonly onHandQuantity: number;
    readonly heldQuantity: number;
    readonly version: number;
  };
}

export async function releaseHeldAllocations(
  transaction: Prisma.TransactionClient,
  scope: { tenantId: string; providerId: string },
  allocations: readonly HeldReservationAllocation[],
  releasedAt: Date,
): Promise<void> {
  for (const allocation of allocations) {
    if (allocation.batch.heldQuantity < allocation.quantity) {
      throw new ConflictException('Reservation allocation exceeds current batch hold');
    }
    const batchUpdate = await transaction.batch.updateMany({
      where: {
        id: allocation.batchId,
        tenantId: scope.tenantId,
        inventoryId: allocation.inventoryId,
        providerId: scope.providerId,
        productId: allocation.productId,
        onHandQuantity: allocation.batch.onHandQuantity,
        heldQuantity: allocation.batch.heldQuantity,
        version: allocation.batch.version,
        deletedAt: null,
      },
      data: { heldQuantity: { decrement: allocation.quantity }, version: { increment: 1 } },
    });
    if (batchUpdate.count !== 1) {
      throw new SerializableRetryError('Concurrent reserved stock release detected');
    }
    const allocationUpdate = await transaction.medicineReservationAllocation.updateMany({
      where: { id: allocation.id, status: 'HELD' },
      data: { status: 'RELEASED', releasedAt },
    });
    if (allocationUpdate.count !== 1) {
      throw new SerializableRetryError('Concurrent reservation allocation update detected');
    }
  }
}
