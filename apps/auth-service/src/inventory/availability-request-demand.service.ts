/**
 * Task 0028 - Privacy-safe live demand analytics service.
 *
 * A focused, read-only aggregate over the accepted Task 0026 durable
 * `AvailabilityRequest` rows and Task 0026 `ProviderProductAvailabilityEvidence`
 * rows. It answers one operational question:
 *
 *   "Which medicines are generating live availability demand at MY pharmacy?"
 *
 * Privacy invariants enforced by construction:
 * - The source is accepted server-side operational records ONLY. No patient/
 *   requester identity, account/membership/session/cookie/device/IP/user-agent,
 *   search-history row, raw medicine search string, coordinate, or free-form
 *   requester text is read, stored, or returned.
 * - `liveRequestCount` is the number of durable `AvailabilityRequest` rows
 *   created/requested in the bounded window. It is NOT a unique-patient count,
 *   NOT a public-search count, and NOT an attempt count (accepted request
 *   deduplication may fold many public attempts into one existing PENDING row).
 * - Outcome counts (AVAILABLE/UNAVAILABLE/CHECK_LATER) come ONLY from accepted
 *   pharmacist-confirmation evidence. Absence of a response is never
 *   interpreted as UNAVAILABLE and CHECK_LATER is never reinterpreted as
 *   unavailable.
 * - The response is a bounded deterministic summary: aggregate window
 *   boundaries, product display fields, and aggregate counts only. No request
 *   id, evidence id, responder identity, exact individual timestamp, or audit
 *   correlation id is ever included.
 *
 * Query shape: exactly two parameterized PostgreSQL aggregate reads after the
 * authorization boundary. The first returns one complete totals row. The
 * second computes the globally correct product ranking in PostgreSQL and
 * applies the caller's bounded limit (1..100) before rows are returned to the
 * application. Confirmation evidence is aggregated only for those selected
 * products. No N+1, no unbounded product-id materialization, and no growing
 * application-side IN (...) list.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertPharmacyProviderAccess, assertTrustedProviderAccess } from './inventory-access';
import type { TrustedInventoryActor } from './inventory-command.types';
import {
  AVAILABILITY_REQUEST_DEMAND_DEFAULT_DAYS,
  AVAILABILITY_REQUEST_DEMAND_DEFAULT_LIMIT,
  AVAILABILITY_REQUEST_DEMAND_MAX_DAYS,
  AVAILABILITY_REQUEST_DEMAND_MAX_LIMIT,
  AVAILABILITY_REQUEST_DEMAND_MIN_DAYS,
  AVAILABILITY_REQUEST_DEMAND_MIN_LIMIT,
} from './dto/availability-request-demand-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AvailabilityRequestDemandTotals {
  readonly liveRequestCount: number;
  readonly pendingCount: number;
  readonly respondedCount: number;
  readonly expiredCount: number;
}

export interface AvailabilityRequestDemandProduct {
  readonly productId: string;
  readonly name: string;
  readonly strength: string;
  readonly dosageForm: string;
  readonly manufacturer: string;

  readonly liveRequestCount: number;
  readonly pendingCount: number;
  readonly respondedCount: number;
  readonly expiredCount: number;

  readonly availableCount: number;
  readonly unavailableCount: number;
  readonly checkLaterCount: number;
}

export interface AvailabilityRequestDemandSummary {
  readonly providerId: string;
  readonly window: {
    readonly from: string;
    readonly to: string;
    readonly days: number;
  };
  readonly totals: AvailabilityRequestDemandTotals;
  readonly products: readonly AvailabilityRequestDemandProduct[];
}

export interface AvailabilityRequestDemandQuery {
  readonly days: number;
  readonly limit: number;
}

export interface AvailabilityRequestDemandReadOptions {
  readonly now?: Date;
}

type DatabaseCount = bigint | number | string;

interface DemandTotalsDatabaseRow {
  readonly liveRequestCount: DatabaseCount;
  readonly pendingCount: DatabaseCount;
  readonly respondedCount: DatabaseCount;
  readonly expiredCount: DatabaseCount;
}

interface DemandProductDatabaseRow {
  readonly productId: string;
  readonly name: string;
  readonly strength: string;
  readonly dosageForm: string;
  readonly manufacturer: string;
  readonly liveRequestCount: DatabaseCount;
  readonly pendingCount: DatabaseCount;
  readonly respondedCount: DatabaseCount;
  readonly expiredCount: DatabaseCount;
  readonly availableCount: DatabaseCount;
  readonly unavailableCount: DatabaseCount;
  readonly checkLaterCount: DatabaseCount;
}

@Injectable()
export class AvailabilityRequestDemandAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async readDemand(
    actor: TrustedInventoryActor,
    providerId: string,
    query: AvailabilityRequestDemandQuery,
    options: AvailabilityRequestDemandReadOptions = {},
  ): Promise<AvailabilityRequestDemandSummary> {
    await assertTrustedProviderAccess(this.prisma.client, actor, providerId);
    await assertPharmacyProviderAccess(this.prisma.client, actor.tenantId, providerId);

    const days = normalizeDays(query.days);
    const limit = normalizeLimit(query.limit);
    const to = this.assertValidClock(options.now ?? new Date());
    const from = new Date(to.getTime() - days * DAY_MS);

    const totalsRows = await this.prisma.client.$queryRaw<DemandTotalsDatabaseRow[]>`
      WITH status_counts AS (
        SELECT 'PENDING'::text AS status, COUNT(*)::bigint AS count
        FROM "AvailabilityRequest"
        WHERE "tenantId" = ${actor.tenantId}::uuid
          AND "providerId" = ${providerId}::uuid
          AND status = 'PENDING'
          AND "requestedAt" >= ${from}
          AND "requestedAt" < ${to}

        UNION ALL

        SELECT 'RESPONDED'::text AS status, COUNT(*)::bigint AS count
        FROM "AvailabilityRequest"
        WHERE "tenantId" = ${actor.tenantId}::uuid
          AND "providerId" = ${providerId}::uuid
          AND status = 'RESPONDED'
          AND "requestedAt" >= ${from}
          AND "requestedAt" < ${to}

        UNION ALL

        SELECT 'EXPIRED'::text AS status, COUNT(*)::bigint AS count
        FROM "AvailabilityRequest"
        WHERE "tenantId" = ${actor.tenantId}::uuid
          AND "providerId" = ${providerId}::uuid
          AND status = 'EXPIRED'
          AND "requestedAt" >= ${from}
          AND "requestedAt" < ${to}
      )
      SELECT
        COALESCE(SUM(count), 0)::bigint AS "liveRequestCount",
        COALESCE(SUM(count) FILTER (WHERE status = 'PENDING'), 0)::bigint AS "pendingCount",
        COALESCE(SUM(count) FILTER (WHERE status = 'RESPONDED'), 0)::bigint AS "respondedCount",
        COALESCE(SUM(count) FILTER (WHERE status = 'EXPIRED'), 0)::bigint AS "expiredCount"
      FROM status_counts
    `;

    const productRows = await this.prisma.client.$queryRaw<DemandProductDatabaseRow[]>`
      WITH request_status_counts AS (
        SELECT "productId", 'PENDING'::text AS status, COUNT(*)::bigint AS count
        FROM "AvailabilityRequest"
        WHERE "tenantId" = ${actor.tenantId}::uuid
          AND "providerId" = ${providerId}::uuid
          AND status = 'PENDING'
          AND "requestedAt" >= ${from}
          AND "requestedAt" < ${to}
        GROUP BY "productId"

        UNION ALL

        SELECT "productId", 'RESPONDED'::text AS status, COUNT(*)::bigint AS count
        FROM "AvailabilityRequest"
        WHERE "tenantId" = ${actor.tenantId}::uuid
          AND "providerId" = ${providerId}::uuid
          AND status = 'RESPONDED'
          AND "requestedAt" >= ${from}
          AND "requestedAt" < ${to}
        GROUP BY "productId"

        UNION ALL

        SELECT "productId", 'EXPIRED'::text AS status, COUNT(*)::bigint AS count
        FROM "AvailabilityRequest"
        WHERE "tenantId" = ${actor.tenantId}::uuid
          AND "providerId" = ${providerId}::uuid
          AND status = 'EXPIRED'
          AND "requestedAt" >= ${from}
          AND "requestedAt" < ${to}
        GROUP BY "productId"
      ),
      request_products AS (
        SELECT
          "productId",
          SUM(count)::bigint AS "liveRequestCount",
          COALESCE(SUM(count) FILTER (WHERE status = 'PENDING'), 0)::bigint AS "pendingCount",
          COALESCE(SUM(count) FILTER (WHERE status = 'RESPONDED'), 0)::bigint AS "respondedCount",
          COALESCE(SUM(count) FILTER (WHERE status = 'EXPIRED'), 0)::bigint AS "expiredCount"
        FROM request_status_counts
        GROUP BY "productId"
      ),
      ranked_products AS MATERIALIZED (
        SELECT
          rp."productId",
          p.name,
          p.strength,
          p."dosageForm"::text AS "dosageForm",
          p.manufacturer,
          rp."liveRequestCount",
          rp."pendingCount",
          rp."respondedCount",
          rp."expiredCount"
        FROM request_products rp
        INNER JOIN "Product" p ON p.id = rp."productId"
        ORDER BY
          rp."liveRequestCount" DESC,
          p.name COLLATE "C" ASC,
          p.strength COLLATE "C" ASC,
          p."dosageForm"::text COLLATE "C" ASC,
          p.id ASC
        LIMIT ${limit}
      )
      SELECT
        rp."productId",
        rp.name,
        rp.strength,
        rp."dosageForm",
        rp.manufacturer,
        rp."liveRequestCount",
        rp."pendingCount",
        rp."respondedCount",
        rp."expiredCount",
        COALESCE(ev."availableCount", 0)::bigint AS "availableCount",
        COALESCE(ev."unavailableCount", 0)::bigint AS "unavailableCount",
        COALESCE(ev."checkLaterCount", 0)::bigint AS "checkLaterCount"
      FROM ranked_products rp
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE e.outcome = 'AVAILABLE')::bigint AS "availableCount",
          COUNT(*) FILTER (WHERE e.outcome = 'UNAVAILABLE')::bigint AS "unavailableCount",
          COUNT(*) FILTER (WHERE e.outcome = 'CHECK_LATER')::bigint AS "checkLaterCount"
        FROM "ProviderProductAvailabilityEvidence" e
        INNER JOIN "AvailabilityRequest" ar
          ON ar.id = e."availabilityRequestId"
         AND ar."tenantId" = e."tenantId"
         AND ar."providerId" = e."providerId"
         AND ar."productId" = e."productId"
        WHERE e."tenantId" = ${actor.tenantId}::uuid
          AND e."providerId" = ${providerId}::uuid
          AND e."productId" = rp."productId"
          AND ar."requestedAt" >= ${from}
          AND ar."requestedAt" < ${to}
      ) ev ON TRUE
      ORDER BY
        rp."liveRequestCount" DESC,
        rp.name COLLATE "C" ASC,
        rp.strength COLLATE "C" ASC,
        rp."dosageForm" COLLATE "C" ASC,
        rp."productId" ASC
    `;

    const totalsRow = totalsRows[0];
    const totals: AvailabilityRequestDemandTotals = {
      liveRequestCount: toSafeCount(totalsRow?.liveRequestCount ?? 0),
      pendingCount: toSafeCount(totalsRow?.pendingCount ?? 0),
      respondedCount: toSafeCount(totalsRow?.respondedCount ?? 0),
      expiredCount: toSafeCount(totalsRow?.expiredCount ?? 0),
    };

    const products = productRows.map((row) => ({
      productId: row.productId,
      name: row.name,
      strength: row.strength,
      dosageForm: row.dosageForm,
      manufacturer: row.manufacturer,
      liveRequestCount: toSafeCount(row.liveRequestCount),
      pendingCount: toSafeCount(row.pendingCount),
      respondedCount: toSafeCount(row.respondedCount),
      expiredCount: toSafeCount(row.expiredCount),
      availableCount: toSafeCount(row.availableCount),
      unavailableCount: toSafeCount(row.unavailableCount),
      checkLaterCount: toSafeCount(row.checkLaterCount),
    }));

    // SQL already provides this order and LIMIT. Re-applying the comparator and
    // slice is bounded defense in depth over at most `limit` database rows.
    products.sort(compareDemandProducts);

    return {
      providerId,
      window: { from: from.toISOString(), to: to.toISOString(), days },
      totals,
      products: products.slice(0, limit),
    };
  }

  private assertValidClock(now: Date): Date {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new Error('Demand analytics clock is invalid');
    }
    return now;
  }
}

/**
 * Deterministic ordering: liveRequestCount DESC, then stable tie-breaking on
 * product display fields (name, strength, dosageForm), finally productId.
 */
export function compareDemandProducts(
  left: AvailabilityRequestDemandProduct,
  right: AvailabilityRequestDemandProduct,
): number {
  if (left.liveRequestCount !== right.liveRequestCount) {
    return right.liveRequestCount - left.liveRequestCount;
  }
  const nameOrder = compareOrdinal(left.name, right.name);
  if (nameOrder !== 0) return nameOrder;
  const strengthOrder = compareOrdinal(left.strength, right.strength);
  if (strengthOrder !== 0) return strengthOrder;
  const dosageFormOrder = compareOrdinal(left.dosageForm, right.dosageForm);
  if (dosageFormOrder !== 0) return dosageFormOrder;
  return compareOrdinal(left.productId, right.productId);
}

function compareOrdinal(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function toSafeCount(value: DatabaseCount): number {
  const count = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Demand analytics count exceeds the supported safe integer range');
  }
  return count;
}

function normalizeDays(value: number): number {
  if (!Number.isSafeInteger(value)) return AVAILABILITY_REQUEST_DEMAND_DEFAULT_DAYS;
  return Math.min(
    Math.max(value, AVAILABILITY_REQUEST_DEMAND_MIN_DAYS),
    AVAILABILITY_REQUEST_DEMAND_MAX_DAYS,
  );
}

function normalizeLimit(value: number): number {
  if (!Number.isSafeInteger(value)) return AVAILABILITY_REQUEST_DEMAND_DEFAULT_LIMIT;
  return Math.min(
    Math.max(value, AVAILABILITY_REQUEST_DEMAND_MIN_LIMIT),
    AVAILABILITY_REQUEST_DEMAND_MAX_LIMIT,
  );
}
