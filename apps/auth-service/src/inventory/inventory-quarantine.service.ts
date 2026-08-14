import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SerializableRetryError,
  hasPrismaCode,
  withSerializableRetry,
} from '@medsphere/database';
import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertTrustedProviderAccess } from './inventory-access';
import { InventoryEventWriter } from './inventory-event-writer';
import {
  BATCH_QUARANTINE_REASONS,
  BatchQuarantineResult,
  QuarantineBatchCommand,
} from './inventory-quarantine.types';
import { releaseHeldAllocations } from './reservation-allocation-release';

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'READY'] as const;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const MAXIMUM_RESERVATIONS = 100;
const MAXIMUM_ALLOCATIONS = 500;

@Injectable()
export class InventoryQuarantineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly events: InventoryEventWriter,
  ) {}

  async quarantine(
    command: QuarantineBatchCommand,
    uniqueRetries = 2,
  ): Promise<BatchQuarantineResult> {
    this.validate(command);
    const commandHash = this.hash(command);

    try {
      return await withSerializableRetry(this.prisma.client, async (transaction) => {
        await assertTrustedProviderAccess(transaction, command.actor, command.providerId);
        const replay = await this.findReplay(
          transaction,
          command.actor.tenantId,
          command.idempotencyKey,
          commandHash,
        );
        if (replay) return replay;

        const [{ occurredAt }] = await transaction.$queryRaw<Array<{ occurredAt: Date }>>(
          Prisma.sql`SELECT CURRENT_TIMESTAMP AS "occurredAt"`,
        );
        if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
          throw new Error('Database timestamp was not returned');
        }

        const batch = await transaction.batch.findFirst({
          where: {
            id: command.batchId,
            tenantId: command.actor.tenantId,
            providerId: command.providerId,
            deletedAt: null,
            inventory: { deletedAt: null },
            provider: { isActive: true, deletedAt: null },
            product: { isActive: true, deletedAt: null },
          },
          select: {
            id: true,
            tenantId: true,
            inventoryId: true,
            providerId: true,
            productId: true,
            status: true,
            expiryDate: true,
            receivedQuantity: true,
            onHandQuantity: true,
            heldQuantity: true,
            version: true,
          },
        });
        if (!batch) throw new NotFoundException('Assigned provider batch not found');
        if (batch.status !== 'ACTIVE') throw new ConflictException('Batch is not active');
        if (batch.expiryDate.getTime() <= occurredAt.getTime()) {
          throw new ConflictException('Expired batch awaits system expiry reconciliation');
        }
        if (batch.version !== command.expectedVersion) {
          throw new ConflictException('Batch version conflict');
        }

        const affected = await transaction.medicineReservation.findMany({
          where: {
            tenantId: batch.tenantId,
            providerId: batch.providerId,
            status: { in: [...ACTIVE_RESERVATION_STATUSES] },
            allocations: { some: { batchId: batch.id, status: 'HELD' } },
          },
          orderBy: { id: 'asc' },
          take: MAXIMUM_RESERVATIONS + 1,
          select: { id: true },
        });
        if (affected.length > MAXIMUM_RESERVATIONS) {
          throw new ConflictException('Batch quarantine reservation limit exceeded');
        }
        const reservationIds = affected.map(({ id }) => id);
        if (reservationIds.length > 0) {
          const allocationProbe = await transaction.medicineReservationAllocation.findMany({
            where: { tenantId: batch.tenantId, reservationId: { in: reservationIds } },
            orderBy: { id: 'asc' },
            take: MAXIMUM_ALLOCATIONS + 1,
            select: { id: true },
          });
          if (allocationProbe.length > MAXIMUM_ALLOCATIONS) {
            throw new ConflictException('Batch quarantine allocation limit exceeded');
          }
        }

        let releasedUnitCount = 0;
        for (const reservationId of reservationIds) {
          const reservation = await transaction.medicineReservation.findFirst({
            where: { id: reservationId, tenantId: batch.tenantId, providerId: batch.providerId },
            select: {
              id: true,
              tenantId: true,
              providerId: true,
              status: true,
              version: true,
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
            throw new SerializableRetryError('Concurrent reservation terminal transition detected');
          }
          if (reservation.allocations.some(({ status }) => status !== 'HELD')) {
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
          if (requestedQuantity !== allocatedQuantity) {
            throw new ConflictException('Medicine reservation holds are incomplete');
          }

          await releaseHeldAllocations(
            transaction,
            { tenantId: reservation.tenantId, providerId: reservation.providerId },
            reservation.allocations,
            occurredAt,
          );
          const resultingReservationVersion = incrementVersion(
            reservation.version,
            'Reservation version limit exceeded',
          );
          const updatedReservation = await transaction.medicineReservation.updateMany({
            where: {
              id: reservation.id,
              tenantId: reservation.tenantId,
              providerId: reservation.providerId,
              status: reservation.status,
              version: reservation.version,
            },
            data: { status: 'CANCELLED', cancelledAt: occurredAt, version: { increment: 1 } },
          });
          if (updatedReservation.count !== 1) {
            throw new SerializableRetryError('Concurrent reservation quarantine detected');
          }

          const reservationIdempotencyKey = `batch-quarantine:${batch.id}:${reservation.id}:${reservation.version}`;
          const reservationCommandHash = createHash('sha256')
            .update(
              JSON.stringify({
                cause: 'BATCH_QUARANTINE',
                batchId: batch.id,
                tenantId: reservation.tenantId,
                providerId: reservation.providerId,
                reservationId: reservation.id,
                previousStatus: reservation.status,
                previousVersion: reservation.version,
              }),
            )
            .digest('hex');
          await transaction.medicineReservationCommand.create({
            data: {
              id: randomUUID(),
              tenantId: reservation.tenantId,
              reservationId: reservation.id,
              providerId: reservation.providerId,
              commandType: 'CANCEL',
              idempotencyKey: reservationIdempotencyKey,
              commandHash: reservationCommandHash,
              resultingStatus: 'CANCELLED',
              resultingVersion: resultingReservationVersion,
              createdAt: occurredAt,
            },
            select: { id: true },
          });
          await this.audit.appendTenantSystem(transaction, {
            tenantId: reservation.tenantId,
            eventType: 'inventory.reservation.cancelled',
            outcome: 'SUCCEEDED',
            resourceType: 'MedicineReservation',
            resourceId: reservation.id,
            occurredAt,
            metadata: {
              previousStatus: reservation.status,
              version: resultingReservationVersion,
              totalQuantity: allocatedQuantity,
              cause: 'BATCH_QUARANTINE',
            },
          });
          await this.events.appendTenantSystem(
            transaction,
            reservation.tenantId,
            'inventory-quarantine-service',
            {
              eventType: 'inventory.reservation.cancelled',
              aggregateType: 'MedicineReservation',
              aggregateId: reservation.id,
              occurredAt,
              payload: {
                providerId: reservation.providerId,
                previousStatus: reservation.status,
                status: 'CANCELLED',
                version: resultingReservationVersion,
                totalQuantity: allocatedQuantity,
                cause: 'BATCH_QUARANTINE',
                batchId: batch.id,
              },
            },
          );
          releasedUnitCount = safeAdd(
            releasedUnitCount,
            allocatedQuantity,
            'Released unit count limit exceeded',
          );
        }

        const releasable = await transaction.batch.findFirst({
          where: {
            id: batch.id,
            tenantId: batch.tenantId,
            inventoryId: batch.inventoryId,
            providerId: batch.providerId,
            productId: batch.productId,
          },
          select: {
            status: true,
            expiryDate: true,
            receivedQuantity: true,
            onHandQuantity: true,
            heldQuantity: true,
            version: true,
            deletedAt: true,
          },
        });
        if (
          !releasable ||
          releasable.deletedAt !== null ||
          releasable.status !== 'ACTIVE' ||
          releasable.expiryDate.getTime() <= occurredAt.getTime() ||
          releasable.receivedQuantity !== batch.receivedQuantity ||
          releasable.onHandQuantity !== batch.onHandQuantity ||
          releasable.heldQuantity !== 0
        ) {
          throw new ConflictException('Batch state is not safe to quarantine');
        }
        const resultingBatchVersion = incrementVersion(
          releasable.version,
          'Batch version limit exceeded',
        );
        const updatedBatch = await transaction.batch.updateMany({
          where: {
            id: batch.id,
            tenantId: batch.tenantId,
            inventoryId: batch.inventoryId,
            providerId: batch.providerId,
            productId: batch.productId,
            status: 'ACTIVE',
            deletedAt: null,
            expiryDate: { gt: occurredAt },
            receivedQuantity: releasable.receivedQuantity,
            onHandQuantity: releasable.onHandQuantity,
            heldQuantity: 0,
            version: releasable.version,
          },
          data: { status: 'QUARANTINED', version: { increment: 1 } },
        });
        if (updatedBatch.count !== 1) {
          throw new SerializableRetryError('Concurrent batch quarantine detected');
        }

        await transaction.batchQuarantineRecord.create({
          data: {
            id: randomUUID(),
            tenantId: batch.tenantId,
            inventoryId: batch.inventoryId,
            providerId: batch.providerId,
            productId: batch.productId,
            batchId: batch.id,
            actorMembershipId: command.actor.membershipId,
            reasonCode: command.reasonCode,
            onHandQuantity: releasable.onHandQuantity,
            affectedReservationCount: reservationIds.length,
            releasedUnitCount,
            idempotencyKey: command.idempotencyKey,
            commandHash,
            resultingBatchVersion,
            occurredAt,
            createdAt: occurredAt,
          },
          select: { id: true },
        });
        await this.audit.appendTenantUser(transaction, {
          tenantId: batch.tenantId,
          actorMembershipId: command.actor.membershipId,
          eventType: 'inventory.batch.quarantined',
          outcome: 'SUCCEEDED',
          resourceType: 'Batch',
          resourceId: batch.id,
          occurredAt,
          request: command.request,
          metadata: {
            productId: batch.productId,
            reasonCode: command.reasonCode,
            onHandQuantity: releasable.onHandQuantity,
            affectedReservations: reservationIds.length,
            releasedUnits: releasedUnitCount,
            resultingVersion: resultingBatchVersion,
          },
        });
        await this.events.appendTenantUser(transaction, command.actor, {
          eventType: 'inventory.batch.quarantined',
          aggregateType: 'Batch',
          aggregateId: batch.id,
          occurredAt,
          payload: {
            providerId: batch.providerId,
            productId: batch.productId,
            status: 'QUARANTINED',
            reasonCode: command.reasonCode,
            onHandQuantity: releasable.onHandQuantity,
            affectedReservations: reservationIds.length,
            releasedUnits: releasedUnitCount,
            version: resultingBatchVersion,
          },
        });

        return {
          batchId: batch.id,
          status: 'QUARANTINED',
          reasonCode: command.reasonCode,
          onHandQuantity: releasable.onHandQuantity,
          affectedReservationCount: reservationIds.length,
          releasedUnitCount,
          resultingBatchVersion,
          occurredAt,
          replayed: false,
        };
      });
    } catch (error) {
      if (!hasPrismaCode(error, 'P2002')) throw error;
      await assertTrustedProviderAccess(this.prisma.client, command.actor, command.providerId);
      const replay = await this.findReplay(
        this.prisma.client,
        command.actor.tenantId,
        command.idempotencyKey,
        commandHash,
      );
      if (replay) return replay;
      if (uniqueRetries > 0) return this.quarantine(command, uniqueRetries - 1);
      throw error;
    }
  }

  private async findReplay(
    database: Pick<Prisma.TransactionClient, 'batchQuarantineRecord'>,
    tenantId: string,
    idempotencyKey: string,
    expectedCommandHash: string,
  ): Promise<BatchQuarantineResult | null> {
    const record = await database.batchQuarantineRecord.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: {
        batchId: true,
        reasonCode: true,
        onHandQuantity: true,
        affectedReservationCount: true,
        releasedUnitCount: true,
        commandHash: true,
        resultingBatchVersion: true,
        occurredAt: true,
      },
    });
    if (!record) return null;
    if (record.commandHash !== expectedCommandHash) {
      throw new ConflictException('Idempotency key is already used by another command');
    }
    return {
      batchId: record.batchId,
      status: 'QUARANTINED',
      reasonCode: record.reasonCode,
      onHandQuantity: record.onHandQuantity,
      affectedReservationCount: record.affectedReservationCount,
      releasedUnitCount: record.releasedUnitCount,
      resultingBatchVersion: record.resultingBatchVersion,
      occurredAt: record.occurredAt,
      replayed: true,
    };
  }

  private validate(command: QuarantineBatchCommand): void {
    if (
      !Number.isSafeInteger(command.expectedVersion) ||
      command.expectedVersion < 1 ||
      command.expectedVersion > MAX_DATABASE_INTEGER
    ) {
      throw new BadRequestException('Expected version must be a positive database-safe integer');
    }
    if (
      command.idempotencyKey.length < 8 ||
      command.idempotencyKey.length > 120 ||
      command.idempotencyKey.trim() !== command.idempotencyKey
    ) {
      throw new BadRequestException('Idempotency key must contain 8 to 120 characters');
    }
    if (!BATCH_QUARANTINE_REASONS.includes(command.reasonCode)) {
      throw new BadRequestException('Unsupported batch quarantine reason');
    }
  }

  private hash(command: QuarantineBatchCommand): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: command.actor.tenantId,
          providerId: command.providerId,
          batchId: command.batchId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          reasonCode: command.reasonCode,
        }),
      )
      .digest('hex');
  }
}

function incrementVersion(value: number, message: string): number {
  const result = value + 1;
  if (
    !Number.isSafeInteger(value) ||
    !Number.isSafeInteger(result) ||
    result > MAX_DATABASE_INTEGER
  ) {
    throw new ConflictException(message);
  }
  return result;
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
