/**
 * Task 0025 - Availability evidence recorder.
 *
 * Appends physical-stock observation evidence with monotonic safety. It is
 * called inside the same transaction as a qualifying inventory observation, so
 * evidence and the Batch quantity authority commit or roll back together.
 *
 * Monotonic rules:
 * - Older evidence for the same batch never supersedes newer evidence.
 * - Exact idempotent replay is a no-op.
 * - Equal-timestamp conflicting evidence fails closed.
 * - Reuse of an idempotency key for different observation content fails closed.
 *
 * Task 0025 opens only the AIM-managed batch-receipt write path. Generic stock
 * adjustments, transfers and damaged-stock write-offs remain inventory
 * mutations but do not, by themselves, prove a fresh physical count.
 */
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { hasPrismaCode, type Prisma } from '@medsphere/database';
import {
  AVAILABILITY_EVIDENCE_SOURCES,
  type AvailabilityEvidenceSource,
} from './availability.types';
import {
  parseAvailabilityFreshnessEnvironment,
  type AvailabilityFreshnessPolicy,
} from './availability-freshness-policy';

export interface RecordAvailabilityObservationInput {
  readonly tenantId: string;
  readonly inventoryId: string;
  readonly batchId: string;
  readonly providerId: string;
  readonly productId: string;
  readonly source: AvailabilityEvidenceSource;
  readonly observedOnHandQuantity: number;
  readonly occurredAt: Date;
  readonly movementId?: string;
  readonly idempotencyKey: string;
}

@Injectable()
export class AvailabilityEvidenceService {
  async recordObservation(
    database: Pick<Prisma.TransactionClient, 'batchStockObservation'>,
    input: RecordAvailabilityObservationInput,
    options: { readonly now?: Date; readonly policy?: AvailabilityFreshnessPolicy } = {},
  ): Promise<boolean> {
    this.validateInput(input);
    const policy = options.policy ?? parseAvailabilityFreshnessEnvironment(process.env);
    const now = options.now ?? new Date();
    this.assertPlausibleOccurredAt(input.occurredAt, now, policy);

    // Resolve idempotency-key reuse before the monotonic timestamp shortcut.
    // Otherwise an older/equal conflicting replay could be silently ignored.
    const byIdempotencyKey = await database.batchStockObservation.findFirst({
      where: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
      select: this.collisionSelect(),
    });
    if (byIdempotencyKey) {
      if (this.isIdenticalObservation(byIdempotencyKey, input)) return false;
      throw new ConflictException(
        'Availability evidence idempotency key is already used by a different observation',
      );
    }

    const latest = await database.batchStockObservation.findFirst({
      where: { tenantId: input.tenantId, batchId: input.batchId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: this.collisionSelect(),
    });
    if (latest) {
      const latestMs = latest.occurredAt.getTime();
      const incomingMs = input.occurredAt.getTime();
      if (latestMs > incomingMs) return false;
      if (latestMs === incomingMs) {
        if (this.isIdenticalObservation(latest, input)) return false;
        throw new ConflictException(
          'Availability evidence conflicts with an existing observation at the same batch timestamp',
        );
      }
    }

    try {
      await database.batchStockObservation.create({
        data: {
          id: randomUUID(),
          tenantId: input.tenantId,
          inventoryId: input.inventoryId,
          batchId: input.batchId,
          providerId: input.providerId,
          productId: input.productId,
          source: input.source,
          observedOnHandQuantity: input.observedOnHandQuantity,
          occurredAt: input.occurredAt,
          movementId: input.movementId ?? null,
          idempotencyKey: input.idempotencyKey,
        },
        select: { id: true },
      });
      return true;
    } catch (error) {
      if (!hasPrismaCode(error, 'P2002')) throw error;
      return this.resolveUniqueCollision(database, input);
    }
  }

  private async resolveUniqueCollision(
    database: Pick<Prisma.TransactionClient, 'batchStockObservation'>,
    input: RecordAvailabilityObservationInput,
  ): Promise<boolean> {
    const byIdempotencyKey = await database.batchStockObservation.findFirst({
      where: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
      select: this.collisionSelect(),
    });
    if (byIdempotencyKey) {
      if (this.isIdenticalObservation(byIdempotencyKey, input)) return false;
      throw new ConflictException(
        'Availability evidence idempotency key is already used by a different observation',
      );
    }

    const byBatchSource = await database.batchStockObservation.findFirst({
      where: {
        batchId: input.batchId,
        occurredAt: input.occurredAt,
        source: input.source,
      },
      select: this.collisionSelect(),
    });
    if (byBatchSource) {
      if (this.isIdenticalObservation(byBatchSource, input)) return false;
      throw new ConflictException(
        'Availability evidence conflicts with an existing observation for the same batch, time, and source',
      );
    }

    throw new ConflictException('Availability evidence write conflicts with existing evidence');
  }

  private collisionSelect(): Prisma.BatchStockObservationSelect {
    return {
      tenantId: true,
      inventoryId: true,
      batchId: true,
      providerId: true,
      productId: true,
      source: true,
      observedOnHandQuantity: true,
      occurredAt: true,
      movementId: true,
    };
  }

  private isIdenticalObservation(
    existing: {
      readonly tenantId: string;
      readonly inventoryId: string;
      readonly batchId: string;
      readonly providerId: string;
      readonly productId: string;
      readonly source: AvailabilityEvidenceSource;
      readonly observedOnHandQuantity: number;
      readonly occurredAt: Date;
      readonly movementId: string | null;
    },
    input: RecordAvailabilityObservationInput,
  ): boolean {
    return (
      existing.tenantId === input.tenantId &&
      existing.inventoryId === input.inventoryId &&
      existing.batchId === input.batchId &&
      existing.providerId === input.providerId &&
      existing.productId === input.productId &&
      existing.source === input.source &&
      existing.observedOnHandQuantity === input.observedOnHandQuantity &&
      existing.occurredAt.getTime() === input.occurredAt.getTime() &&
      existing.movementId === (input.movementId ?? null)
    );
  }

  private validateInput(input: RecordAvailabilityObservationInput): void {
    if (!(AVAILABILITY_EVIDENCE_SOURCES as readonly string[]).includes(input.source)) {
      throw new BadRequestException('Availability evidence source is not accepted');
    }
    if (!Number.isSafeInteger(input.observedOnHandQuantity) || input.observedOnHandQuantity < 0) {
      throw new BadRequestException('Observed quantity must be a non-negative safe integer');
    }
    if (Number.isNaN(input.occurredAt.getTime())) {
      throw new BadRequestException('Observation occurrence timestamp is invalid');
    }
    if (
      input.idempotencyKey.length === 0 ||
      input.idempotencyKey.length > 120 ||
      input.idempotencyKey !== input.idempotencyKey.trim()
    ) {
      throw new BadRequestException(
        'Observation idempotency key must contain 1 to 120 trimmed characters',
      );
    }
  }

  private assertPlausibleOccurredAt(
    occurredAt: Date,
    now: Date,
    policy: AvailabilityFreshnessPolicy,
  ): void {
    if (!Number.isFinite(now.getTime())) {
      throw new Error('Availability evidence clock is invalid');
    }
    if (occurredAt.getTime() > now.getTime() + policy.futureObservationAllowedSkewMs) {
      throw new BadRequestException(
        'Observation occurrence timestamp is implausibly in the future',
      );
    }
  }
}
