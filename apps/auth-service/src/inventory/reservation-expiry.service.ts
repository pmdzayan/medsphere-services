import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, hasPrismaCode, withSerializableRetry } from '@medsphere/database';
import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { releaseHeldAllocations } from './reservation-allocation-release';
import type { ReservationExpiryConfig } from './reservation-expiry.config';

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'READY'] as const;

export interface ReservationExpirySummary {
  readonly asOf: Date;
  readonly selected: number;
  readonly expired: number;
  readonly skipped: number;
  readonly failed: number;
  readonly failures: Readonly<Record<string, number>>;
}

@Injectable()
export class ReservationExpiryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async run(config: ReservationExpiryConfig): Promise<ReservationExpirySummary> {
    validateConfig(config);
    const [{ asOf }] = await this.prisma.client.$queryRaw<Array<{ asOf: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP AS "asOf"`,
    );
    if (!(asOf instanceof Date) || Number.isNaN(asOf.getTime())) {
      throw new Error('Database did not return an authoritative expiry timestamp');
    }

    const attemptedIds: string[] = [];
    let expired = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Record<string, number> = {};

    while (attemptedIds.length < config.maximumRecords) {
      const remaining = config.maximumRecords - attemptedIds.length;
      const candidates = await this.prisma.client.medicineReservation.findMany({
        where: {
          status: { in: [...ACTIVE_STATUSES] },
          expiresAt: { lte: asOf },
          ...(attemptedIds.length > 0 ? { id: { notIn: attemptedIds } } : {}),
        },
        orderBy: [{ expiresAt: 'asc' }, { tenantId: 'asc' }, { id: 'asc' }],
        take: Math.min(config.batchSize, remaining),
        select: { id: true, tenantId: true, providerId: true },
      });
      if (candidates.length === 0) break;

      for (const candidate of candidates) {
        attemptedIds.push(candidate.id);
        try {
          const outcome = await this.expire(candidate, asOf);
          if (outcome === 'EXPIRED') expired += 1;
          else skipped += 1;
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
      expired,
      skipped,
      failed,
      failures,
    };
  }

  private expire(
    candidate: { id: string; tenantId: string; providerId: string },
    asOf: Date,
  ): Promise<'EXPIRED' | 'SKIPPED'> {
    return withSerializableRetry(this.prisma.client, async (transaction) => {
      const reservation = await transaction.medicineReservation.findFirst({
        where: {
          id: candidate.id,
          tenantId: candidate.tenantId,
          providerId: candidate.providerId,
        },
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
        !ACTIVE_STATUSES.includes(reservation.status as (typeof ACTIVE_STATUSES)[number]) ||
        reservation.expiresAt.getTime() > asOf.getTime()
      ) {
        return 'SKIPPED';
      }

      const requestedQuantity = safeTotal(
        reservation.items.map((item) => item.quantity),
        'Reservation item quantities are invalid',
      );
      if (reservation.allocations.some((allocation) => allocation.status !== 'HELD')) {
        throw new ConflictException('Active reservation contains a non-held allocation');
      }
      const allocatedQuantity = safeTotal(
        reservation.allocations.map((allocation) => allocation.quantity),
        'Reservation allocation quantities are invalid',
      );
      if (requestedQuantity <= 0 || allocatedQuantity !== requestedQuantity) {
        throw new ConflictException('Medicine reservation holds are incomplete');
      }

      await releaseHeldAllocations(
        transaction,
        { tenantId: reservation.tenantId, providerId: reservation.providerId },
        reservation.allocations,
        asOf,
      );

      const resultingVersion = reservation.version + 1;
      const updated = await transaction.medicineReservation.updateMany({
        where: {
          id: reservation.id,
          tenantId: reservation.tenantId,
          providerId: reservation.providerId,
          status: reservation.status,
          version: reservation.version,
          expiresAt: { lte: asOf },
        },
        data: { status: 'EXPIRED', expiredAt: asOf, version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        const error = new Error('Concurrent reservation expiry detected') as Error & {
          code: string;
        };
        error.code = 'P2034';
        throw error;
      }

      const idempotencyKey = `expiry:${reservation.id}:${reservation.version}`;
      const commandHash = createHash('sha256')
        .update(
          JSON.stringify({
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
        },
        select: { id: true },
      });
      await this.audit.appendTenantSystem(transaction, {
        tenantId: reservation.tenantId,
        eventType: 'inventory.reservation.expired',
        outcome: 'SUCCEEDED',
        resourceType: 'MedicineReservation',
        resourceId: reservation.id,
        metadata: {
          previousStatus: reservation.status,
          version: resultingVersion,
          totalQuantity: allocatedQuantity,
          expiresAt: reservation.expiresAt.toISOString(),
        },
      });
      return 'EXPIRED';
    });
  }
}

function validateConfig(config: ReservationExpiryConfig): void {
  if (!Number.isSafeInteger(config.batchSize) || config.batchSize < 1 || config.batchSize > 100) {
    throw new Error('Reservation expiry batch size must be between 1 and 100');
  }
  if (
    !Number.isSafeInteger(config.maximumRecords) ||
    config.maximumRecords < 1 ||
    config.maximumRecords > 1_000
  ) {
    throw new Error('Reservation expiry maximum records must be between 1 and 1000');
  }
}

function safeTotal(values: readonly number[], message: string): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value <= 0 || !Number.isSafeInteger(total + value)) {
      throw new ConflictException(message);
    }
    total += value;
  }
  return total;
}

function failureCategory(error: unknown): string {
  if (error instanceof ConflictException) return 'invariant_conflict';
  if (hasPrismaCode(error, 'P2002')) return 'command_conflict';
  if (hasPrismaCode(error, 'P2034')) return 'concurrency_conflict';
  return 'unexpected';
}
