import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, hasPrismaCode, withSerializableRetry } from '@medsphere/database';
import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import type { BatchExpiryConfig } from './batch-expiry.config';
import { releaseHeldAllocations } from './reservation-allocation-release';

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'READY'] as const;

export interface BatchExpirySummary {
  readonly asOf: Date;
  readonly selected: number;
  readonly reconciled: number;
  readonly skipped: number;
  readonly failed: number;
  readonly affectedReservations: number;
  readonly releasedUnits: number;
  readonly failures: Readonly<Record<string, number>>;
}

interface CandidateOutcome {
  readonly status: 'RECONCILED' | 'SKIPPED';
  readonly affectedReservations: number;
  readonly releasedUnits: number;
}

@Injectable()
export class BatchExpiryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async run(config: BatchExpiryConfig): Promise<BatchExpirySummary> {
    validateConfig(config);
    const [{ asOf }] = await this.prisma.client.$queryRaw<Array<{ asOf: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP AS "asOf"`,
    );
    if (!(asOf instanceof Date) || Number.isNaN(asOf.getTime())) {
      throw new Error('Database did not return an authoritative batch-expiry timestamp');
    }

    const attemptedIds: string[] = [];
    let reconciled = 0;
    let skipped = 0;
    let failed = 0;
    let affectedReservations = 0;
    let releasedUnits = 0;
    const failures: Record<string, number> = {};

    while (attemptedIds.length < config.maximumRecords) {
      const remaining = config.maximumRecords - attemptedIds.length;
      const candidates = await this.prisma.client.batch.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          expiryDate: { lte: asOf },
          ...(attemptedIds.length > 0 ? { id: { notIn: attemptedIds } } : {}),
        },
        orderBy: [{ expiryDate: 'asc' }, { tenantId: 'asc' }, { id: 'asc' }],
        take: Math.min(config.batchSize, remaining),
        select: { id: true, tenantId: true, inventoryId: true, providerId: true, productId: true },
      });
      if (candidates.length === 0) break;

      for (const candidate of candidates) {
        attemptedIds.push(candidate.id);
        try {
          const outcome = await this.reconcile(candidate, asOf, config);
          if (outcome.status === 'RECONCILED') {
            reconciled += 1;
            affectedReservations = safeAdd(
              affectedReservations,
              outcome.affectedReservations,
              'Batch expiry reservation count overflow',
            );
            releasedUnits = safeAdd(
              releasedUnits,
              outcome.releasedUnits,
              'Batch expiry released-unit count overflow',
            );
          } else {
            skipped += 1;
          }
        } catch (error) {
          failed += 1;
          const category = failureCategory(error);
          failures[category] = (failures[category] ?? 0) + 1;
        }
      }
    }

    return {
      asOf,
      selected: attemptedIds.length,
      reconciled,
      skipped,
      failed,
      affectedReservations,
      releasedUnits,
      failures,
    };
  }

  private reconcile(
    candidate: {
      id: string;
      tenantId: string;
      inventoryId: string;
      providerId: string;
      productId: string;
    },
    asOf: Date,
    config: BatchExpiryConfig,
  ): Promise<CandidateOutcome> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const batch = await transaction.batch.findFirst({
        where: candidate,
        select: {
          id: true,
          tenantId: true,
          inventoryId: true,
          providerId: true,
          productId: true,
          status: true,
          receivedQuantity: true,
          onHandQuantity: true,
          heldQuantity: true,
          expiryDate: true,
          version: true,
          deletedAt: true,
        },
      });
      if (
        !batch ||
        batch.deletedAt !== null ||
        batch.status !== 'ACTIVE' ||
        batch.expiryDate.getTime() > asOf.getTime()
      ) {
        return { status: 'SKIPPED', affectedReservations: 0, releasedUnits: 0 };
      }

      const affected = await transaction.medicineReservation.findMany({
        where: {
          tenantId: batch.tenantId,
          providerId: batch.providerId,
          status: { in: [...ACTIVE_RESERVATION_STATUSES] },
          allocations: { some: { batchId: batch.id, status: 'HELD' } },
        },
        orderBy: { id: 'asc' },
        take: config.maximumReservationsPerBatch + 1,
        select: { id: true },
      });
      if (affected.length > config.maximumReservationsPerBatch) {
        throw new BatchExpiryLimitError('Batch expiry reservation limit exceeded');
      }
      const reservationIds = affected.map(({ id }) => id);
      if (reservationIds.length > 0) {
        const allocationLimitProbe = await transaction.medicineReservationAllocation.findMany({
          where: { tenantId: batch.tenantId, reservationId: { in: reservationIds } },
          orderBy: { id: 'asc' },
          take: config.maximumAllocationsPerBatch + 1,
          select: { id: true },
        });
        if (allocationLimitProbe.length > config.maximumAllocationsPerBatch) {
          throw new BatchExpiryLimitError('Batch expiry allocation limit exceeded');
        }
      }

      let releasedUnits = 0;
      let affectedReservations = 0;
      for (const reservationId of reservationIds) {
        const reservation = await transaction.medicineReservation.findFirst({
          where: { id: reservationId, tenantId: batch.tenantId, providerId: batch.providerId },
          select: {
            id: true,
            tenantId: true,
            providerId: true,
            status: true,
            version: true,
            expiresAt: true,
            items: { select: { quantity: true } },
            allocations: {
              orderBy: { id: 'asc' },
              select: {
                id: true,
                inventoryId: true,
                batchId: true,
                productId: true,
                quantity: true,
                status: true,
                batch: {
                  select: { onHandQuantity: true, heldQuantity: true, version: true },
                },
              },
            },
          },
        });
        if (
          !reservation ||
          !ACTIVE_RESERVATION_STATUSES.includes(
            reservation.status as (typeof ACTIVE_RESERVATION_STATUSES)[number],
          )
        ) {
          throw concurrencyError('Concurrent reservation terminal transition detected');
        }
        if (reservation.allocations.some((allocation) => allocation.status !== 'HELD')) {
          throw new ConflictException('Active reservation contains a non-held allocation');
        }
        const requestedQuantity = safeTotal(
          reservation.items.map(({ quantity }) => quantity),
          'Reservation item quantities are invalid',
        );
        const allocatedQuantity = safeTotal(
          reservation.allocations.map(({ quantity }) => quantity),
          'Reservation allocation quantities are invalid',
        );
        if (requestedQuantity <= 0 || requestedQuantity !== allocatedQuantity) {
          throw new ConflictException('Medicine reservation holds are incomplete');
        }

        await releaseHeldAllocations(
          transaction,
          { tenantId: reservation.tenantId, providerId: reservation.providerId },
          reservation.allocations,
          asOf,
        );
        const resultingVersion = reservation.version + 1;
        if (!Number.isSafeInteger(resultingVersion)) {
          throw new ConflictException('Reservation version overflow');
        }
        const updated = await transaction.medicineReservation.updateMany({
          where: {
            id: reservation.id,
            tenantId: reservation.tenantId,
            providerId: reservation.providerId,
            status: reservation.status,
            version: reservation.version,
          },
          data: { status: 'EXPIRED', expiredAt: asOf, version: { increment: 1 } },
        });
        if (updated.count !== 1) {
          throw concurrencyError('Concurrent reservation batch expiry detected');
        }

        const idempotencyKey = `batch-expiry:${batch.id}:${reservation.id}:${reservation.version}`;
        const commandHash = createHash('sha256')
          .update(
            JSON.stringify({
              cause: 'BATCH_EXPIRY',
              batchId: batch.id,
              tenantId: reservation.tenantId,
              providerId: reservation.providerId,
              reservationId: reservation.id,
              previousStatus: reservation.status,
              previousVersion: reservation.version,
              expiresAt: reservation.expiresAt.toISOString(),
            }),
          )
          .digest('hex');
        await transaction.medicineReservationCommand.create({
          data: {
            id: randomUUID(),
            tenantId: reservation.tenantId,
            reservationId: reservation.id,
            providerId: reservation.providerId,
            commandType: 'EXPIRE',
            idempotencyKey,
            commandHash,
            resultingStatus: 'EXPIRED',
            resultingVersion,
            createdAt: asOf,
          },
          select: { id: true },
        });
        await this.audit.appendTenantSystem(transaction, {
          tenantId: reservation.tenantId,
          eventType: 'inventory.reservation.expired',
          outcome: 'SUCCEEDED',
          resourceType: 'MedicineReservation',
          resourceId: reservation.id,
          occurredAt: asOf,
          metadata: {
            previousStatus: reservation.status,
            version: resultingVersion,
            totalQuantity: allocatedQuantity,
            cause: 'BATCH_EXPIRY',
          },
        });
        releasedUnits = safeAdd(
          releasedUnits,
          allocatedQuantity,
          'Batch expiry released-unit count overflow',
        );
        affectedReservations += 1;
      }

      const releasable = await transaction.batch.findFirst({
        where: candidate,
        select: {
          status: true,
          receivedQuantity: true,
          onHandQuantity: true,
          heldQuantity: true,
          expiryDate: true,
          version: true,
          deletedAt: true,
        },
      });
      if (
        !releasable ||
        releasable.deletedAt !== null ||
        releasable.status !== 'ACTIVE' ||
        releasable.expiryDate.getTime() > asOf.getTime() ||
        releasable.receivedQuantity !== batch.receivedQuantity ||
        releasable.onHandQuantity !== batch.onHandQuantity ||
        releasable.heldQuantity !== 0
      ) {
        throw new ConflictException('Due batch state is not safe to reconcile');
      }
      const resultingBatchVersion = releasable.version + 1;
      if (!Number.isSafeInteger(resultingBatchVersion)) {
        throw new ConflictException('Batch version overflow');
      }
      const updatedBatch = await transaction.batch.updateMany({
        where: {
          ...candidate,
          status: 'ACTIVE',
          deletedAt: null,
          expiryDate: { lte: asOf },
          receivedQuantity: releasable.receivedQuantity,
          onHandQuantity: releasable.onHandQuantity,
          heldQuantity: 0,
          version: releasable.version,
        },
        data: { status: 'EXPIRED', version: { increment: 1 } },
      });
      if (updatedBatch.count !== 1) {
        throw concurrencyError('Concurrent physical batch expiry detected');
      }

      await transaction.batchExpiryRecord.create({
        data: {
          id: randomUUID(),
          batchId: candidate.id,
          tenantId: candidate.tenantId,
          inventoryId: candidate.inventoryId,
          providerId: candidate.providerId,
          productId: candidate.productId,
          expiryDate: releasable.expiryDate,
          onHandQuantity: releasable.onHandQuantity,
          resultingBatchVersion,
          reconciledAt: asOf,
          createdAt: asOf,
        },
        select: { id: true },
      });
      await this.audit.appendTenantSystem(transaction, {
        tenantId: batch.tenantId,
        eventType: 'inventory.batch.expired',
        outcome: 'SUCCEEDED',
        resourceType: 'Batch',
        resourceId: batch.id,
        occurredAt: asOf,
        metadata: {
          productId: batch.productId,
          onHandQuantity: releasable.onHandQuantity,
          affectedReservations,
          releasedUnits,
          resultingVersion: resultingBatchVersion,
        },
      });
      return { status: 'RECONCILED', affectedReservations, releasedUnits };
    });
  }
}

class BatchExpiryLimitError extends Error {}

function validateConfig(config: BatchExpiryConfig): void {
  const values: Array<[number, number, string]> = [
    [config.batchSize, 100, 'batch size'],
    [config.maximumRecords, 1_000, 'maximum records'],
    [config.maximumReservationsPerBatch, 500, 'reservation limit'],
    [config.maximumAllocationsPerBatch, 5_000, 'allocation limit'],
  ];
  for (const [value, maximum, label] of values) {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new Error(`Batch expiry ${label} must be between 1 and ${maximum}`);
    }
  }
}

function safeTotal(values: readonly number[], message: string): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new ConflictException(message);
    total = safeAdd(total, value, message);
  }
  return total;
}

function safeAdd(left: number, right: number, message: string): number {
  const result = left + right;
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(result)
  ) {
    throw new ConflictException(message);
  }
  return result;
}

function concurrencyError(message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = 'P2034';
  return error;
}

function failureCategory(error: unknown): string {
  if (error instanceof BatchExpiryLimitError) return 'limit_exceeded';
  if (error instanceof ConflictException) return 'invariant_conflict';
  if (hasPrismaCode(error, 'P2002')) return 'record_conflict';
  if (hasPrismaCode(error, 'P2034')) return 'concurrency_conflict';
  return 'unexpected';
}
