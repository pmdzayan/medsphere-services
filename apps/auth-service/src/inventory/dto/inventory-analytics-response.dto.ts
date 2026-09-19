import { ApiProperty } from '@nestjs/swagger';

/**
 * Candidate Task 0038 (PROVISIONAL). See
 * docs/candidates/0038-pharmacy-inventory-analytics-provisional.md
 */
export class InventoryAnalyticsSummaryDto {
  @ApiProperty() distinctProductCount!: number;
  @ApiProperty() activeBatchCount!: number;
  @ApiProperty() availableQuantity!: number;
  @ApiProperty() heldQuantity!: number;
  @ApiProperty() unavailableProductCount!: number;
  @ApiProperty({
    nullable: true,
    description:
      'Products whose available quantity is below their own accepted Inventory.minimumStockLevel. Null if not computable.',
  })
  lowStockProductCount!: number | null;
}

export class ReservationAnalyticsSummaryDto {
  @ApiProperty() pending!: number;
  @ApiProperty() confirmed!: number;
  @ApiProperty() ready!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() cancelled!: number;
  @ApiProperty() expired!: number;
  @ApiProperty({ description: 'PENDING + CONFIRMED + READY' }) activeCount!: number;
  @ApiProperty({ description: 'Sum of HELD MedicineReservationAllocation.quantity' })
  heldQuantity!: number;
}

export class ExpiryAnalyticsSummaryDto {
  @ApiProperty() expiredBatchCount!: number;
  @ApiProperty() nearExpiryBatchCount!: number;
  @ApiProperty() horizonDays!: number;
}

export class QualityAnalyticsSummaryDto {
  @ApiProperty() quarantinedBatchCount!: number;
  @ApiProperty({
    description:
      'Cumulative historical COUNT of StockMovement rows of type DAMAGED (i.e. how many times damage has ever been recorded for this provider). This is deliberately NOT a "current damaged-on-hand quantity" metric: recording damage permanently reduces Batch.onHandQuantity (inventory-damage.service.ts computes onHandAfter = onHandBefore - quantity), so damaged units are already removed from stock by the time this movement exists -- there is no accepted "damaged, still present" state to report as a live quantity. Investigated and confirmed before naming this field.',
  })
  damagedMovementCount!: number;
}

export class TransferAnalyticsSummaryDto {
  @ApiProperty({
    description:
      'InventoryTransfer has no pending/in-progress state in the accepted schema -- every row represents an already-completed transfer, so only a completed count is reported.',
  })
  completedCount!: number;
}

export class InventoryAttentionItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    enum: ['NEAR_EXPIRY_BATCH'],
    description:
      'This candidate currently emits only NEAR_EXPIRY_BATCH. Additional types (expired/quarantined/reservation-related) are deliberately excluded from this contract until actually implemented with deterministic, tested behavior -- the catalogue reflects what this candidate genuinely produces.',
  })
  type!: string;
  @ApiProperty({
    enum: ['ATTENTION'],
    description:
      'Every NEAR_EXPIRY_BATCH item is ATTENTION. The near-expiry source query only ever returns batches with expiryDate >= now (see the service), so an "already past due" URGENT branch would be unreachable dead code for this item type -- removed rather than retained as misleading policy.',
  })
  severity!: string;
  @ApiProperty({ format: 'uuid' }) providerId!: string;
  @ApiProperty({
    enum: ['Batch'],
    description:
      'This candidate currently only sources attention items from Batch. The BFF requires this exact value; a different value is contract-invalid.',
  })
  sourceResourceType!: string;
  @ApiProperty({ format: 'uuid', description: 'The Batch.id this attention item refers to.' })
  sourceResourceId!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) occurredAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) dueAt!: string | null;
}

export class InventoryAnalyticsResponseDto {
  @ApiProperty({ format: 'uuid' }) providerId!: string;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
  @ApiProperty({ type: InventoryAnalyticsSummaryDto }) inventory!: InventoryAnalyticsSummaryDto;
  @ApiProperty({ type: ReservationAnalyticsSummaryDto })
  reservations!: ReservationAnalyticsSummaryDto;
  @ApiProperty({ type: ExpiryAnalyticsSummaryDto }) expiry!: ExpiryAnalyticsSummaryDto;
  @ApiProperty({ type: QualityAnalyticsSummaryDto }) quality!: QualityAnalyticsSummaryDto;
  @ApiProperty({ type: TransferAnalyticsSummaryDto }) transfers!: TransferAnalyticsSummaryDto;
  @ApiProperty({ type: [InventoryAttentionItemDto] }) attentionItems!: InventoryAttentionItemDto[];
}
