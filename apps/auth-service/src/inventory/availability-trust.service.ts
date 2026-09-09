/**
 * Task 0025 - Canonical availability-trust read service.
 *
 * Provides the domain/service contract future verticals call (patient search,
 * Live Availability Request reconciliation, analytics, trust metrics) without
 * rederiving freshness/eligibility rules. It loads the accepted Batch quantity
 * snapshot plus the newest physical-stock observation evidence, then delegates
 * interpretation to the single canonical AvailabilityTrustEvaluator.
 *
 * This service does NOT open a public/patient endpoint in Task 0025. It is the
 * internal contract; later tasks mount public surfaces on top of it.
 *
 * Tenant/provider isolation: every query is scoped by the caller-supplied
 * tenantId and providerId. Evidence rows carry the same composite tenant/FK
 * scoping as Batch/StockMovement and are only reachable through those scoped
 * relations, so Tenant A evidence can never surface under Tenant B.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseAvailabilityFreshnessEnvironment,
  type AvailabilityFreshnessPolicy,
} from './availability-freshness-policy';
import type {
  AvailabilityTrustEvaluation,
  BatchAvailabilityCandidate,
  BatchStockEvidence,
} from './availability.types';
import { AvailabilityTrustEvaluator } from './availability-trust.evaluator';

export interface EvaluateProviderProductTrustOptions {
  readonly now?: Date;
  readonly policy?: AvailabilityFreshnessPolicy;
}

@Injectable()
export class AvailabilityTrustService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluator: AvailabilityTrustEvaluator,
  ) {}

  /**
   * Evaluates the availability-trust state for one (provider, product) within a
   * tenant using the accepted Batch quantity authority and the newest stock
   * observation evidence. Always returns a deterministic evaluation, never
   * throws for merely-absent data (no inventory, no batches, no evidence are
   * all legitimate UNKNOWN states).
   */
  async evaluateProviderProduct(
    tenantId: string,
    providerId: string,
    productId: string,
    options: EvaluateProviderProductTrustOptions = {},
  ): Promise<AvailabilityTrustEvaluation> {
    const now = options.now ?? new Date();
    const policy = options.policy ?? parseAvailabilityFreshnessEnvironment(process.env);

    const inventory = await this.prisma.client.inventory.findFirst({
      where: { tenantId, providerId, productId, deletedAt: null },
      select: { id: true },
    });
    if (!inventory) {
      return this.evaluator.evaluateInventory(
        { inventoryId: null, batches: [], evidenceByBatch: new Map() },
        { now, policy },
      );
    }

    // Include ALL batches of the listing, including soft-deleted rows: the
    // evaluator is the single place that decides eligibility (a listing whose
    // batches were all soft-deleted is authoritatively without sellable stock,
    // i.e. UNAVAILABLE, not UNKNOWN). This keeps deletion semantics inside the
    // accepted Batch safety rules instead of leaking them into the read query.
    const rows = await this.prisma.client.batch.findMany({
      where: { tenantId, providerId, productId, inventoryId: inventory.id },
      select: {
        id: true,
        inventoryId: true,
        productId: true,
        expiryDate: true,
        onHandQuantity: true,
        heldQuantity: true,
        status: true,
        deletedAt: true,
      },
      orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
    });

    const batches: BatchAvailabilityCandidate[] = rows.map((row) => ({
      id: row.id,
      inventoryId: row.inventoryId,
      productId: row.productId,
      expiryDate: row.expiryDate,
      onHandQuantity: row.onHandQuantity,
      heldQuantity: row.heldQuantity,
      status: row.status,
      deletedAt: row.deletedAt,
    }));

    const evidenceByBatch = await this.loadNewestEvidencePerBatch(tenantId, batches);

    return this.evaluator.evaluateInventory(
      { inventoryId: inventory.id, batches, evidenceByBatch },
      { now, policy },
    );
  }

  /**
   * Loads the single newest observation row per batch (ordered by occurredAt
   * desc, then id desc for deterministic tie-breaking) into the evidence map
   * the evaluator consumes.
   */
  private async loadNewestEvidencePerBatch(
    tenantId: string,
    batches: readonly BatchAvailabilityCandidate[],
  ): Promise<Map<string, BatchStockEvidence>> {
    const evidence = new Map<string, BatchStockEvidence>();
    if (batches.length === 0) return evidence;

    const rows = await this.prisma.client.batchStockObservation.findMany({
      where: {
        tenantId,
        batchId: { in: batches.map((batch) => batch.id) },
      },
      select: { batchId: true, source: true, occurredAt: true, observedOnHandQuantity: true },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });

    for (const row of rows) {
      if (evidence.has(row.batchId)) continue;
      evidence.set(row.batchId, {
        source: row.source,
        observedAt: row.occurredAt,
        observedOnHandQuantity: row.observedOnHandQuantity,
      });
    }
    return evidence;
  }
}
