import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { assertTrustedProviderAccess } from './inventory-access';
import type { InventoryAnalyticsQueryDto } from './dto/inventory-analytics-query.dto';
import type {
  InventoryAnalyticsResponseDto,
  InventoryAttentionItemDto,
} from './dto/inventory-analytics-response.dto';

const ATTENTION_ITEM_ABSOLUTE_MAX = 50;

/**
 * Candidate Task 0038 (PROVISIONAL). See
 * docs/candidates/0038-pharmacy-inventory-analytics-provisional.md
 *
 * Read-only. There is no mutation path anywhere in this service --
 * every method here only ever issues Prisma reads (count/aggregate/
 * groupBy/findMany with an explicit take), never create/update/delete.
 *
 * Authorization reuses the exact accepted provider-assignment boundary
 * (`assertTrustedProviderAccess`, Task 0020/ADR-007) -- the same
 * primitive used by mutation services elsewhere in this module. No
 * second authorization system is introduced.
 *
 * Consistency: this is a best-effort near-real-time snapshot, not a
 * serializable transaction. The aggregate queries below run
 * concurrently (Promise.all), not inside one shared transaction --
 * for an operational analytics dashboard (not a financial ledger),
 * millisecond-scale skew between counts is an accepted tradeoff
 * documented in the candidate doc, not a correctness bug.
 */
@Injectable()
export class InventoryAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(
    identity: AuthenticatedIdentity,
    providerId: string,
    query: InventoryAnalyticsQueryDto,
  ): Promise<InventoryAnalyticsResponseDto> {
    // Reuses the exact accepted provider-assignment boundary -- fails
    // closed with a NotFoundException (never a different error shape)
    // for an unassigned, cross-tenant, revoked, or nonexistent
    // provider, concealing which case applied.
    await assertTrustedProviderAccess(this.prisma.client, identity, providerId);

    const tenantId = identity.tenantId;
    const now = new Date();
    const nearExpiryEndsAt = new Date(now.getTime() + query.nearExpiryHorizonDays * 86_400_000);

    const [
      distinctProductCount,
      activeBatchAggregate,
      lowStockAndUnavailableCounts,
      expiredBatchCount,
      nearExpiryBatchCount,
      nearExpiryBatches,
      quarantinedBatchCount,
      damagedMovementCount,
      reservationCountsByStatus,
      heldAllocationAggregate,
      completedTransferCount,
    ] = await Promise.all([
      // Distinct stocked products: one Inventory row per (provider,
      // product) by the accepted unique constraint, so a bounded count
      // over that row set IS the distinct product count.
      this.prisma.client.inventory.count({
        where: { tenantId, providerId, deletedAt: null },
      }),
      this.prisma.client.batch.aggregate({
        where: {
          tenantId,
          providerId,
          status: 'ACTIVE',
          expiryDate: { gt: now },
          deletedAt: null,
        },
        _count: { _all: true },
        _sum: { onHandQuantity: true, heldQuantity: true },
      }),
      // Correction (hardened query-bound review): the previous
      // implementation issued a groupBy() + findMany() and joined them
      // in application code -- both are scoped by tenantId/providerId,
      // but neither carries an explicit row-count bound, so a
      // pharmacy with an arbitrarily large catalogue could still
      // materialize an arbitrarily large row set in Node before the
      // final scalar counts were computed. This single parameterized
      // $queryRaw call (the same accepted pattern already used
      // elsewhere in this module, e.g. batch-expiry.service.ts)
      // computes both scalar counts entirely in the database and
      // returns exactly one row, regardless of catalogue size -- no
      // row-level materialization of arbitrary size ever reaches
      // application code. Prisma.sql parameterizes every interpolated
      // value (tenantId, providerId) -- there is no string
      // concatenation and no uncontrolled input reaches the query.
      this.prisma.client.$queryRaw<
        { unavailableProductCount: bigint; lowStockProductCount: bigint }[]
      >(
        Prisma.sql`
          WITH active_batch_sums AS (
            SELECT "inventoryId", SUM("onHandQuantity" - "heldQuantity") AS available
            FROM "Batch"
            WHERE "tenantId" = ${tenantId}
              AND "providerId" = ${providerId}
              AND status = 'ACTIVE'
              AND "expiryDate" > ${now}
              AND "deletedAt" IS NULL
            GROUP BY "inventoryId"
          )
          SELECT
            COUNT(*) FILTER (WHERE COALESCE(batch_sums.available, 0) <= 0) AS "unavailableProductCount",
            COUNT(*) FILTER (WHERE COALESCE(batch_sums.available, 0) < i."minimumStockLevel") AS "lowStockProductCount"
          FROM "Inventory" i
          LEFT JOIN active_batch_sums batch_sums ON batch_sums."inventoryId" = i.id
          WHERE i."tenantId" = ${tenantId}
            AND i."providerId" = ${providerId}
            AND i."deletedAt" IS NULL
        `,
      ),
      this.prisma.client.batch.count({
        where: { tenantId, providerId, status: 'EXPIRED', deletedAt: null },
      }),
      // Correction: the aggregate COUNT for this metric must never be
      // capped by the attention-item list bound. This is a dedicated
      // scalar query using the identical predicates as the list query
      // below (tenantId, providerId, status ACTIVE, deletedAt null,
      // expiryDate in [now, nearExpiryEndsAt]) -- the metric and the
      // attention list are distinct concepts and must never be
      // conflated by reusing one bounded list's .length as the other's
      // count, which previously silently truncated any count above 50
      // to exactly 50.
      this.prisma.client.batch.count({
        where: {
          tenantId,
          providerId,
          status: 'ACTIVE',
          deletedAt: null,
          expiryDate: { gte: now, lte: nearExpiryEndsAt },
        },
      }),
      this.prisma.client.batch.findMany({
        where: {
          tenantId,
          providerId,
          status: 'ACTIVE',
          deletedAt: null,
          expiryDate: { gte: now, lte: nearExpiryEndsAt },
        },
        select: { id: true, expiryDate: true, inventoryId: true, productId: true },
        orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
        // DTO validation already guarantees 1 <= attentionItemLimit <=
        // 50 (@Min(1) @Max(50) in InventoryAnalyticsQueryDto), so this
        // list is bounded by the caller's own requested limit, never
        // by a fixed constant that could silently under-report the
        // aggregate count above.
        take: query.attentionItemLimit,
      }),
      this.prisma.client.batch.count({
        where: { tenantId, providerId, status: 'QUARANTINED', deletedAt: null },
      }),
      this.prisma.client.stockMovement.count({
        where: { tenantId, providerId, type: 'DAMAGED' },
      }),
      this.prisma.client.medicineReservation.groupBy({
        by: ['status'],
        where: { tenantId, providerId },
        _count: { _all: true },
      }),
      this.prisma.client.medicineReservationAllocation.aggregate({
        where: { tenantId, providerId, status: 'HELD' },
        _sum: { quantity: true },
      }),
      this.prisma.client.inventoryTransfer.count({
        where: {
          tenantId,
          // A transfer counts for BOTH the source and destination
          // pharmacy -- a staff member at either side has an
          // operational interest in transfers touching their own
          // provider, whether they sent or received the stock.
          OR: [{ sourceProviderId: providerId }, { destinationProviderId: providerId }],
        },
      }),
    ]);

    const computedUnavailableProductCount = toSafeNonNegativeCount(
      lowStockAndUnavailableCounts[0]?.unavailableProductCount ?? 0n,
      'unavailableProductCount',
    );
    const computedLowStockProductCount = toSafeNonNegativeCount(
      lowStockAndUnavailableCounts[0]?.lowStockProductCount ?? 0n,
      'lowStockProductCount',
    );

    const reservationCounts: Record<string, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      READY: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      EXPIRED: 0,
    };
    for (const row of reservationCountsByStatus) {
      reservationCounts[row.status] = row._count._all;
    }

    const attentionItems = buildAttentionItems({
      providerId,
      nearExpiryBatches,
      expiredBatchCount,
      quarantinedBatchCount,
      limit: query.attentionItemLimit,
    });

    return {
      providerId,
      generatedAt: now.toISOString(),
      inventory: {
        distinctProductCount,
        activeBatchCount: activeBatchAggregate._count._all,
        availableQuantity:
          (activeBatchAggregate._sum.onHandQuantity ?? 0) -
          (activeBatchAggregate._sum.heldQuantity ?? 0),
        heldQuantity: activeBatchAggregate._sum.heldQuantity ?? 0,
        unavailableProductCount: computedUnavailableProductCount,
        lowStockProductCount: computedLowStockProductCount,
      },
      reservations: {
        pending: reservationCounts.PENDING,
        confirmed: reservationCounts.CONFIRMED,
        ready: reservationCounts.READY,
        completed: reservationCounts.COMPLETED,
        cancelled: reservationCounts.CANCELLED,
        expired: reservationCounts.EXPIRED,
        activeCount:
          reservationCounts.PENDING + reservationCounts.CONFIRMED + reservationCounts.READY,
        heldQuantity: heldAllocationAggregate._sum.quantity ?? 0,
      },
      expiry: {
        expiredBatchCount,
        nearExpiryBatchCount,
        horizonDays: query.nearExpiryHorizonDays,
      },
      quality: {
        quarantinedBatchCount,
        damagedMovementCount,
      },
      transfers: {
        completedCount: completedTransferCount,
      },
      attentionItems,
    };
  }
}

/**
 * Correction (BigInt/safe-integer boundary): a parameterized
 * PostgreSQL COUNT(...) FILTER (...) returns `bigint` in Prisma's
 * `$queryRaw` results, never a plain `number`. A raw `Number(value)`
 * conversion accepts ANY bigint magnitude silently -- including one
 * exceeding Number.MAX_SAFE_INTEGER, which would corrupt the value
 * without any error -- and does not runtime-verify the value is even
 * a bigint at all (a malformed/unexpected shape from the raw query
 * result would otherwise pass through uncaught). This function is the
 * single, explicit boundary: only a genuine, non-negative,
 * safe-integer-range bigint may cross from raw SQL into the rest of
 * this service and eventually into JSON. Anything else fails closed
 * with a bounded application error rather than leaking a raw BigInt
 * into Nest/BFF/frontend JSON (which would throw its own uncontrolled
 * serialization error) or silently corrupting an out-of-range count.
 */
export function toSafeNonNegativeCount(value: unknown, fieldName: string): number {
  if (typeof value !== 'bigint') {
    throw new InternalServerErrorException(`${fieldName} aggregate did not return a bigint`);
  }
  if (value < 0n) {
    throw new InternalServerErrorException(`${fieldName} aggregate returned a negative value`);
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InternalServerErrorException(`${fieldName} aggregate exceeds the safe integer range`);
  }
  return Number(value);
}

function buildAttentionItems(input: {
  providerId: string;
  nearExpiryBatches: { id: string; expiryDate: Date; inventoryId: string; productId: string }[];
  expiredBatchCount: number;
  quarantinedBatchCount: number;
  limit: number;
}): InventoryAttentionItemDto[] {
  const items: InventoryAttentionItemDto[] = input.nearExpiryBatches.map((batch) => ({
    id: batch.id,
    type: 'NEAR_EXPIRY_BATCH',
    // Correction (severity review): the near-expiry SOURCE QUERY only
    // ever returns ACTIVE batches with expiryDate >= now (see the
    // query above), so a "batch already past its expiry date" branch
    // here would be unreachable dead code for this item type -- a
    // batch already past due and still reconciled as ACTIVE is a
    // distinct operational-reconciliation concern the accepted expiry
    // model does not yet represent as a separate metric, and is
    // intentionally not invented here (Option A from the correction:
    // minimal, truthful scope). Every NEAR_EXPIRY_BATCH item is
    // therefore uniformly ATTENTION, never URGENT.
    severity: 'ATTENTION',
    providerId: input.providerId,
    sourceResourceType: 'Batch',
    sourceResourceId: batch.id,
    occurredAt: null,
    dueAt: batch.expiryDate.toISOString(),
  }));

  // Deterministic ordering and tie-break: soonest due date first, then
  // by id, matching the query's own ORDER BY -- never re-sorted by an
  // unstable criterion.
  return items.slice(0, Math.min(input.limit, ATTENTION_ITEM_ABSOLUTE_MAX));
}
