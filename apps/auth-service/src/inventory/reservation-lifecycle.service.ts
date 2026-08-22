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
import type { AuditMetadata } from '@medsphere/database';
import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertTrustedProviderAccess } from './inventory-access';
import { InventoryEventWriter } from './inventory-event-writer';
import type {
  ProviderReservationResultStatus,
  ProviderReservationTransition,
  ProviderReservationTransitionResult,
  TransitionProviderReservationCommand,
} from './reservation.types';
import { releaseHeldAllocations } from './reservation-allocation-release';

type ActiveReservationStatus = 'PENDING' | 'CONFIRMED' | 'READY';

const TRANSITIONS: Record<
  ProviderReservationTransition,
  { from: readonly ActiveReservationStatus[]; to: ProviderReservationResultStatus }
> = {
  CONFIRM: { from: ['PENDING'], to: 'CONFIRMED' },
  READY: { from: ['CONFIRMED'], to: 'READY' },
  COMPLETE: { from: ['READY'], to: 'COMPLETED' },
  CANCEL: { from: ['PENDING', 'CONFIRMED', 'READY'], to: 'CANCELLED' },
};

@Injectable()
export class ReservationLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly events: InventoryEventWriter,
  ) {}

  async transition(
    command: TransitionProviderReservationCommand,
  ): Promise<ProviderReservationTransitionResult> {
    this.validate(command);
    const commandHash = this.commandHash(command);
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

        const reservation = await transaction.medicineReservation.findFirst({
          where: {
            id: command.reservationId,
            tenantId: command.actor.tenantId,
            providerId: command.providerId,
          },
          select: {
            id: true,
            status: true,
            version: true,
            expiresAt: true,
            items: { select: { quantity: true } },
            allocations: {
              where: { status: 'HELD' },
              select: {
                id: true,
                inventoryId: true,
                batchId: true,
                productId: true,
                quantity: true,
                batch: {
                  select: {
                    onHandQuantity: true,
                    heldQuantity: true,
                    version: true,
                    expiryDate: true,
                  },
                },
              },
              orderBy: { id: 'asc' },
            },
          },
        });
        if (!reservation) throw new NotFoundException('Medicine reservation not found');
        if (reservation.version !== command.expectedVersion) {
          throw new ConflictException('Medicine reservation version conflict');
        }

        const rule = TRANSITIONS[command.transition];
        if (!rule.from.includes(reservation.status as ActiveReservationStatus)) {
          throw new ConflictException(
            `Cannot ${command.transition.toLowerCase()} reservation from ${reservation.status}`,
          );
        }
        const now = new Date();
        if (reservation.expiresAt.getTime() <= now.getTime()) {
          throw new ConflictException('Expired medicine reservation awaits system expiry');
        }

        const totalQuantity = reservation.allocations.reduce(
          (total, allocation) => total + allocation.quantity,
          0,
        );
        const requestedQuantity = reservation.items.reduce(
          (total, item) => total + item.quantity,
          0,
        );
        if (totalQuantity !== requestedQuantity) {
          throw new ConflictException('Medicine reservation holds are incomplete');
        }

        if (command.transition === 'COMPLETE') {
          await this.consumeAllocations(
            transaction,
            command,
            reservation.allocations,
            commandHash,
            now,
          );
        } else if (command.transition === 'CANCEL') {
          await releaseHeldAllocations(
            transaction,
            { tenantId: command.actor.tenantId, providerId: command.providerId },
            reservation.allocations,
            now,
          );
        }

        const resultingVersion = reservation.version + 1;
        const updated = await transaction.medicineReservation.updateMany({
          where: {
            id: reservation.id,
            tenantId: command.actor.tenantId,
            providerId: command.providerId,
            status: reservation.status,
            version: reservation.version,
          },
          data: {
            status: rule.to,
            version: { increment: 1 },
            ...this.transitionTimestamp(command.transition, now),
          },
        });
        if (updated.count !== 1) {
          throw new SerializableRetryError('Concurrent reservation transition detected');
        }

        await this.appendAudit(
          transaction,
          command,
          reservation.status,
          rule.to,
          resultingVersion,
          totalQuantity,
          now,
        );
        await transaction.medicineReservationCommand.create({
          data: {
            id: randomUUID(),
            tenantId: command.actor.tenantId,
            reservationId: command.reservationId,
            providerId: command.providerId,
            commandType: command.transition,
            idempotencyKey: command.idempotencyKey,
            commandHash,
            resultingStatus: rule.to,
            resultingVersion,
          },
          select: { id: true },
        });
        return {
          reservationId: command.reservationId,
          status: rule.to,
          version: resultingVersion,
          totalQuantity,
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
      if (!replay) throw error;
      return replay;
    }
  }

  private async consumeAllocations(
    transaction: Prisma.TransactionClient,
    command: TransitionProviderReservationCommand,
    allocations: readonly AllocationRecord[],
    commandHash: string,
    now: Date,
  ): Promise<void> {
    for (const allocation of allocations) {
      if (allocation.batch.expiryDate.getTime() <= now.getTime()) {
        throw new ConflictException('Cannot complete a reservation containing expired stock');
      }
      const onHandAfter = allocation.batch.onHandQuantity - allocation.quantity;
      const heldAfter = allocation.batch.heldQuantity - allocation.quantity;
      if (onHandAfter < 0 || heldAfter < 0) {
        throw new ConflictException('Reservation allocation exceeds current batch stock');
      }
      const batchUpdate = await transaction.batch.updateMany({
        where: this.batchMatch(command, allocation),
        data: {
          onHandQuantity: { decrement: allocation.quantity },
          heldQuantity: { decrement: allocation.quantity },
          status: onHandAfter === 0 ? 'EXHAUSTED' : 'ACTIVE',
          version: { increment: 1 },
        },
      });
      if (batchUpdate.count !== 1) {
        throw new SerializableRetryError('Concurrent reserved stock consumption detected');
      }
      await this.updateAllocation(transaction, allocation.id, 'CONSUMED', now);
      await transaction.stockMovement.create({
        data: {
          id: randomUUID(),
          tenantId: command.actor.tenantId,
          inventoryId: allocation.inventoryId,
          batchId: allocation.batchId,
          providerId: command.providerId,
          productId: allocation.productId,
          type: 'STOCK_OUT',
          delta: -allocation.quantity,
          onHandBefore: allocation.batch.onHandQuantity,
          onHandAfter,
          referenceType: 'medicine.reservation.complete',
          referenceId: command.reservationId,
          reason: 'Medicine reservation completed',
          idempotencyKey: this.movementKey(command.idempotencyKey, allocation.id),
          commandHash,
          actorType: 'TENANT_USER',
          actorMembershipId: command.actor.membershipId,
        },
        select: { id: true },
      });
    }
  }

  private batchMatch(command: TransitionProviderReservationCommand, allocation: AllocationRecord) {
    return {
      id: allocation.batchId,
      tenantId: command.actor.tenantId,
      inventoryId: allocation.inventoryId,
      providerId: command.providerId,
      productId: allocation.productId,
      onHandQuantity: allocation.batch.onHandQuantity,
      heldQuantity: allocation.batch.heldQuantity,
      version: allocation.batch.version,
      deletedAt: null,
    };
  }

  private async updateAllocation(
    transaction: Prisma.TransactionClient,
    allocationId: string,
    status: 'CONSUMED' | 'RELEASED',
    now: Date,
  ): Promise<void> {
    const updated = await transaction.medicineReservationAllocation.updateMany({
      where: { id: allocationId, status: 'HELD' },
      data: status === 'CONSUMED' ? { status, consumedAt: now } : { status, releasedAt: now },
    });
    if (updated.count !== 1) {
      throw new SerializableRetryError('Concurrent reservation allocation update detected');
    }
  }

  private async appendAudit(
    transaction: Prisma.TransactionClient,
    command: TransitionProviderReservationCommand,
    previousStatus: string,
    resultingStatus: ProviderReservationResultStatus,
    version: number,
    totalQuantity: number,
    occurredAt: Date,
  ): Promise<void> {
    const suffix = resultingStatus.toLowerCase() as
      'confirmed' | 'ready' | 'completed' | 'cancelled';
    const metadata: AuditMetadata =
      resultingStatus === 'CONFIRMED' || resultingStatus === 'READY'
        ? { previousStatus, version }
        : { previousStatus, version, totalQuantity };
    await this.audit.appendTenantUser(transaction, {
      tenantId: command.actor.tenantId,
      actorMembershipId: command.actor.membershipId,
      eventType: `inventory.reservation.${suffix}`,
      outcome: 'SUCCEEDED',
      resourceType: 'MedicineReservation',
      resourceId: command.reservationId,
      occurredAt,
      metadata,
      request: command.request,
    });
    await this.events.appendTenantUser(transaction, command.actor, {
      eventType: `inventory.reservation.${suffix}`,
      aggregateType: 'MedicineReservation',
      aggregateId: command.reservationId,
      occurredAt,
      payload: {
        providerId: command.providerId,
        previousStatus,
        status: resultingStatus,
        version,
        totalQuantity,
      },
    });
  }

  private transitionTimestamp(transition: ProviderReservationTransition, now: Date) {
    switch (transition) {
      case 'CONFIRM':
        return { confirmedAt: now };
      case 'READY':
        return { readyAt: now };
      case 'COMPLETE':
        return { completedAt: now };
      case 'CANCEL':
        return { cancelledAt: now };
    }
  }

  private async findReplay(
    database: Pick<Prisma.TransactionClient, 'medicineReservationCommand'>,
    tenantId: string,
    idempotencyKey: string,
    commandHash: string,
  ): Promise<ProviderReservationTransitionResult | null> {
    const receipt = await database.medicineReservationCommand.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: {
        reservationId: true,
        commandHash: true,
        resultingStatus: true,
        resultingVersion: true,
        reservation: { select: { allocations: { select: { quantity: true } } } },
      },
    });
    if (!receipt) return null;
    if (receipt.commandHash !== commandHash) {
      throw new ConflictException('Idempotency key is already used by another transition');
    }
    return {
      reservationId: receipt.reservationId,
      status: receipt.resultingStatus as ProviderReservationResultStatus,
      version: receipt.resultingVersion,
      totalQuantity: receipt.reservation.allocations.reduce(
        (total, allocation) => total + allocation.quantity,
        0,
      ),
      replayed: true,
    };
  }

  private validate(command: TransitionProviderReservationCommand): void {
    if (command.reservationId.length === 0 || command.providerId.length === 0) {
      throw new BadRequestException('Reservation and provider identifiers are required');
    }
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) {
      throw new BadRequestException('Expected version must be a positive safe integer');
    }
    if (
      command.idempotencyKey.trim() !== command.idempotencyKey ||
      command.idempotencyKey.length === 0 ||
      command.idempotencyKey.length > 120
    ) {
      throw new BadRequestException('Idempotency key must contain 1 to 120 trimmed characters');
    }
  }

  private commandHash(command: TransitionProviderReservationCommand): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: command.actor.tenantId,
          providerId: command.providerId,
          reservationId: command.reservationId,
          transition: command.transition,
          expectedVersion: command.expectedVersion,
        }),
      )
      .digest('hex');
  }

  private movementKey(idempotencyKey: string, allocationId: string): string {
    return `reservation:${createHash('sha256')
      .update(`${idempotencyKey}:${allocationId}`)
      .digest('hex')}`;
  }
}

interface AllocationRecord {
  readonly id: string;
  readonly inventoryId: string;
  readonly batchId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly batch: {
    readonly onHandQuantity: number;
    readonly heldQuantity: number;
    readonly version: number;
    readonly expiryDate: Date;
  };
}
