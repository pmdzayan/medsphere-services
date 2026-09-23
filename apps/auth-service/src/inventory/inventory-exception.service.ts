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
  BATCH_RECALL_REASONS,
  INVENTORY_EXCEPTION_ACTIONS,
  INVENTORY_EXCEPTION_DECISIONS,
  type BatchRecallResult,
  type DecideInventoryExceptionCommand,
  type InventoryExceptionDecisionResult,
  type InventoryExceptionRequestResult,
  type RecallBatchCommand,
  type RequestInventoryExceptionCommand,
} from './inventory-exception.types';
import { releaseHeldAllocations } from './reservation-allocation-release';

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'READY'] as const;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const MAXIMUM_RESERVATIONS = 100;
const MAXIMUM_ALLOCATIONS = 500;
const SERIALIZABLE_ATTEMPTS = 10;

@Injectable()
export class InventoryExceptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly events: InventoryEventWriter,
  ) {}

  async recall(command: RecallBatchCommand, uniqueRetries = 2): Promise<BatchRecallResult> {
    this.validateRecall(command);
    const commandHash = this.hashRecall(command);

    try {
      return await withSerializableRetry(
        this.prisma.client,
        async (transaction) => {
          await assertTrustedProviderAccess(transaction, command.actor, command.providerId);
          const replay = await this.findRecallReplay(
            transaction,
            command.actor.tenantId,
            command.providerId,
            command.idempotencyKey,
            commandHash,
          );
          if (replay) return replay;

          const occurredAt = await databaseNow(transaction);
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
          if (batch.status === 'RECALLED') throw new ConflictException('Batch is already recalled');
          if (batch.status === 'EXPIRED' || batch.expiryDate.getTime() <= occurredAt.getTime()) {
            throw new ConflictException('Expired batch cannot enter the recall workflow');
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
            throw new ConflictException('Batch recall reservation limit exceeded');
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
              throw new ConflictException('Batch recall allocation limit exceeded');
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
              throw new SerializableRetryError('Concurrent reservation recall detected');
            }

            const reservationIdempotencyKey =
              `batch-recall:${batch.id}:${reservation.id}:${reservation.version}`;
            const reservationCommandHash = createHash('sha256')
              .update(
                JSON.stringify({
                  cause: 'BATCH_RECALL',
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
            await this.audit.appendTenantUser(transaction, {
              tenantId: reservation.tenantId,
              actorMembershipId: command.actor.membershipId,
              actorUserId: command.actor.userId,
              eventType: 'inventory.reservation.cancelled',
              outcome: 'SUCCEEDED',
              resourceType: 'MedicineReservation',
              resourceId: reservation.id,
              occurredAt,
              metadata: {
                previousStatus: reservation.status,
                version: resultingReservationVersion,
                totalQuantity: allocatedQuantity,
                cause: 'BATCH_RECALL',
              },
              request: command.request,
            });
            await this.events.appendTenantUser(transaction, command.actor, {
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
                cause: 'BATCH_RECALL',
                batchId: batch.id,
              },
            });
            releasedUnitCount = safeAdd(
              releasedUnitCount,
              allocatedQuantity,
              'Released unit count limit exceeded',
            );
          }

          const current = await transaction.batch.findFirst({
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
            !current ||
            current.deletedAt !== null ||
            current.status === 'RECALLED' ||
            current.status === 'EXPIRED' ||
            current.expiryDate.getTime() <= occurredAt.getTime() ||
            current.receivedQuantity !== batch.receivedQuantity ||
            current.onHandQuantity !== batch.onHandQuantity ||
            current.heldQuantity !== 0
          ) {
            throw new ConflictException('Batch state is not safe to recall');
          }
          const resultingBatchVersion = incrementVersion(
            current.version,
            'Batch version limit exceeded',
          );
          const updatedBatch = await transaction.batch.updateMany({
            where: {
              id: batch.id,
              tenantId: batch.tenantId,
              inventoryId: batch.inventoryId,
              providerId: batch.providerId,
              productId: batch.productId,
              status: current.status,
              deletedAt: null,
              expiryDate: { gt: occurredAt },
              receivedQuantity: current.receivedQuantity,
              onHandQuantity: current.onHandQuantity,
              heldQuantity: 0,
              version: current.version,
            },
            data: { status: 'RECALLED', version: { increment: 1 } },
          });
          if (updatedBatch.count !== 1) {
            throw new SerializableRetryError('Concurrent batch recall detected');
          }

          await transaction.batchRecallRecord.create({
            data: {
              id: randomUUID(),
              tenantId: batch.tenantId,
              inventoryId: batch.inventoryId,
              providerId: batch.providerId,
              productId: batch.productId,
              batchId: batch.id,
              actorMembershipId: command.actor.membershipId,
              actorUserId: command.actor.userId,
              reasonCode: command.reasonCode,
              reason: command.reason,
              onHandQuantity: current.onHandQuantity,
              affectedReservationCount: reservationIds.length,
              releasedUnitCount,
              resultingBatchVersion,
              idempotencyKey: command.idempotencyKey,
              commandHash,
              occurredAt,
              createdAt: occurredAt,
            },
            select: { id: true },
          });

          await this.audit.appendTenantUser(transaction, {
            tenantId: batch.tenantId,
            actorMembershipId: command.actor.membershipId,
            actorUserId: command.actor.userId,
            eventType: 'inventory.batch.recalled',
            outcome: 'SUCCEEDED',
            resourceType: 'Batch',
            resourceId: batch.id,
            occurredAt,
            request: command.request,
            metadata: {
              productId: batch.productId,
              reasonCode: command.reasonCode,
              onHandQuantity: current.onHandQuantity,
              affectedReservations: reservationIds.length,
              releasedUnits: releasedUnitCount,
              resultingVersion: resultingBatchVersion,
            },
          });
          await this.events.appendTenantUser(transaction, command.actor, {
            eventType: 'inventory.batch.recalled',
            aggregateType: 'Batch',
            aggregateId: batch.id,
            occurredAt,
            payload: {
              providerId: batch.providerId,
              productId: batch.productId,
              status: 'RECALLED',
              reasonCode: command.reasonCode,
              onHandQuantity: current.onHandQuantity,
              affectedReservations: reservationIds.length,
              releasedUnits: releasedUnitCount,
              version: resultingBatchVersion,
            },
          });

          return {
            batchId: batch.id,
            status: 'RECALLED',
            reasonCode: command.reasonCode,
            onHandQuantity: current.onHandQuantity,
            affectedReservationCount: reservationIds.length,
            releasedUnitCount,
            resultingBatchVersion,
            occurredAt,
            replayed: false,
          };
        },
        SERIALIZABLE_ATTEMPTS,
      );
    } catch (error) {
      if (!hasPrismaCode(error, 'P2002')) throw error;
      await assertTrustedProviderAccess(this.prisma.client, command.actor, command.providerId);
      const replay = await this.findRecallReplay(
        this.prisma.client,
        command.actor.tenantId,
        command.providerId,
        command.idempotencyKey,
        commandHash,
      );
      if (replay) return replay;
      if (uniqueRetries > 0) return this.recall(command, uniqueRetries - 1);
      throw error;
    }
  }

  async request(
    command: RequestInventoryExceptionCommand,
    uniqueRetries = 2,
  ): Promise<InventoryExceptionRequestResult> {
    this.validateRequest(command);
    const commandHash = this.hashRequest(command);

    try {
      return await withSerializableRetry(
        this.prisma.client,
        async (transaction) => {
          await assertTrustedProviderAccess(transaction, command.actor, command.providerId);
          const replay = await this.findRequestReplay(
            transaction,
            command.actor.tenantId,
            command.providerId,
            command.idempotencyKey,
            commandHash,
          );
          if (replay) return replay;

          const requestedAt = await databaseNow(transaction);
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
              inventoryId: true,
              providerId: true,
              productId: true,
              status: true,
              expiryDate: true,
              onHandQuantity: true,
              heldQuantity: true,
              version: true,
            },
          });
          if (!batch) throw new NotFoundException('Assigned provider batch not found');
          if (batch.version !== command.expectedVersion) {
            throw new ConflictException('Batch version conflict');
          }
          this.assertActionEligible(command.action, command.quantity, batch, requestedAt);

          const pending = await transaction.inventoryExceptionRequest.findFirst({
            where: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              batchId: batch.id,
              action: command.action,
              decision: null,
            },
            select: { id: true },
          });
          if (pending) {
            throw new ConflictException('A matching inventory exception request is already pending');
          }

          const requestId = randomUUID();
          await transaction.inventoryExceptionRequest.create({
            data: {
              id: requestId,
              tenantId: command.actor.tenantId,
              inventoryId: batch.inventoryId,
              providerId: command.providerId,
              productId: batch.productId,
              batchId: batch.id,
              requestedByMembershipId: command.actor.membershipId,
              requestedByUserId: command.actor.userId,
              action: command.action,
              quantity: command.quantity,
              reason: command.reason,
              requestedBatchVersion: batch.version,
              idempotencyKey: command.idempotencyKey,
              commandHash,
              requestedAt,
              createdAt: requestedAt,
            },
            select: { id: true },
          });

          await this.audit.appendTenantUser(transaction, {
            tenantId: command.actor.tenantId,
            actorMembershipId: command.actor.membershipId,
            actorUserId: command.actor.userId,
            eventType: 'inventory.exception.requested',
            outcome: 'SUCCEEDED',
            resourceType: 'InventoryExceptionRequest',
            resourceId: requestId,
            occurredAt: requestedAt,
            request: command.request,
            metadata: {
              providerId: command.providerId,
              action: command.action,
              quantity: command.quantity ?? null,
              requestedVersion: batch.version,
            },
          });

          return {
            requestId,
            providerId: command.providerId,
            batchId: batch.id,
            action: command.action,
            quantity: command.quantity ?? null,
            requestedBatchVersion: batch.version,
            requestedAt,
            replayed: false,
          };
        },
        SERIALIZABLE_ATTEMPTS,
      );
    } catch (error) {
      if (!hasPrismaCode(error, 'P2002')) throw error;
      await assertTrustedProviderAccess(this.prisma.client, command.actor, command.providerId);
      const replay = await this.findRequestReplay(
        this.prisma.client,
        command.actor.tenantId,
        command.providerId,
        command.idempotencyKey,
        commandHash,
      );
      if (replay) return replay;
      if (uniqueRetries > 0) return this.request(command, uniqueRetries - 1);
      throw error;
    }
  }

  async decide(
    command: DecideInventoryExceptionCommand,
    uniqueRetries = 2,
  ): Promise<InventoryExceptionDecisionResult> {
    this.validateDecision(command);
    const commandHash = this.hashDecision(command);

    try {
      return await withSerializableRetry(
        this.prisma.client,
        async (transaction) => {
          await assertTrustedProviderAccess(transaction, command.actor, command.providerId);
          const replay = await this.findDecisionReplay(
            transaction,
            command.actor.tenantId,
            command.providerId,
            command.idempotencyKey,
            commandHash,
          );
          if (replay) return replay;

          const occurredAt = await databaseNow(transaction);
          const request = await transaction.inventoryExceptionRequest.findFirst({
            where: {
              id: command.requestId,
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
            },
            select: {
              id: true,
              tenantId: true,
              inventoryId: true,
              providerId: true,
              productId: true,
              batchId: true,
              requestedByMembershipId: true,
              requestedByUserId: true,
              action: true,
              quantity: true,
              requestedBatchVersion: true,
              decision: { select: { id: true } },
              batch: {
                select: {
                  status: true,
                  expiryDate: true,
                  receivedQuantity: true,
                  onHandQuantity: true,
                  heldQuantity: true,
                  version: true,
                  deletedAt: true,
                },
              },
            },
          });
          if (!request) throw new NotFoundException('Inventory exception request not found');
          if (request.decision) throw new ConflictException('Inventory exception request is decided');
          if (
            request.requestedByMembershipId === command.actor.membershipId ||
            request.requestedByUserId === command.actor.userId
          ) {
            throw new ConflictException('Inventory exception approval requires a different actor');
          }

          let movementId: string | null = null;
          let onHandBefore: number | null = null;
          let onHandAfter: number | null = null;
          let resultingBatchVersion: number | null = null;

          if (command.outcome === 'APPROVED') {
            const batch = request.batch;
            if (batch.deletedAt !== null || batch.version !== request.requestedBatchVersion) {
              throw new ConflictException('Inventory exception request is stale');
            }
            if (batch.heldQuantity !== 0) {
              throw new ConflictException('Batch has active reservation holds');
            }

            onHandBefore = batch.onHandQuantity;
            resultingBatchVersion = incrementVersion(batch.version, 'Batch version limit exceeded');

            if (request.action === 'QUARANTINE_RELEASE') {
              if (batch.status !== 'QUARANTINED') {
                throw new ConflictException('Only a quarantined batch can be released');
              }
              if (batch.expiryDate.getTime() <= occurredAt.getTime()) {
                throw new ConflictException('Expired batch cannot be released to saleable stock');
              }
              onHandAfter = batch.onHandQuantity;
              const nextStatus = batch.onHandQuantity === 0 ? 'EXHAUSTED' : 'ACTIVE';
              const updated = await transaction.batch.updateMany({
                where: {
                  id: request.batchId,
                  tenantId: request.tenantId,
                  inventoryId: request.inventoryId,
                  providerId: request.providerId,
                  productId: request.productId,
                  status: 'QUARANTINED',
                  version: batch.version,
                  onHandQuantity: batch.onHandQuantity,
                  heldQuantity: 0,
                  deletedAt: null,
                },
                data: { status: nextStatus, version: { increment: 1 } },
              });
              if (updated.count !== 1) {
                throw new SerializableRetryError('Concurrent quarantine release detected');
              }
            } else {
              if (!['QUARANTINED', 'RECALLED', 'EXPIRED'].includes(batch.status)) {
                throw new ConflictException(
                  'Physical disposition requires quarantined, recalled, or expired stock',
                );
              }
              const quantity = request.quantity;
              if (
                quantity === null ||
                !Number.isSafeInteger(quantity) ||
                quantity < 1 ||
                quantity > batch.onHandQuantity
              ) {
                throw new ConflictException('Disposition quantity exceeds current stock');
              }
              onHandAfter = batch.onHandQuantity - quantity;
              const updated = await transaction.batch.updateMany({
                where: {
                  id: request.batchId,
                  tenantId: request.tenantId,
                  inventoryId: request.inventoryId,
                  providerId: request.providerId,
                  productId: request.productId,
                  status: batch.status,
                  version: batch.version,
                  onHandQuantity: batch.onHandQuantity,
                  heldQuantity: 0,
                  deletedAt: null,
                },
                data: { onHandQuantity: onHandAfter, version: { increment: 1 } },
              });
              if (updated.count !== 1) {
                throw new SerializableRetryError('Concurrent inventory disposition detected');
              }
              movementId = randomUUID();
              const disposal = request.action === 'DISPOSAL';
              await transaction.stockMovement.create({
                data: {
                  id: movementId,
                  tenantId: request.tenantId,
                  inventoryId: request.inventoryId,
                  batchId: request.batchId,
                  providerId: request.providerId,
                  productId: request.productId,
                  type: disposal ? 'DISPOSAL' : 'RETURN_OUT',
                  delta: -quantity,
                  onHandBefore,
                  onHandAfter,
                  referenceType: disposal
                    ? 'inventory.exception.disposal'
                    : 'inventory.exception.supplier-return',
                  referenceId: request.id,
                  reason: command.reason,
                  idempotencyKey: movementKey(command.idempotencyKey, request.id),
                  commandHash,
                  resultingBatchVersion,
                  actorType: 'TENANT_USER',
                  actorMembershipId: command.actor.membershipId,
                  occurredAt,
                },
                select: { id: true },
              });
            }
          }

          const decisionId = randomUUID();
          await transaction.inventoryExceptionDecision.create({
            data: {
              id: decisionId,
              requestId: request.id,
              tenantId: request.tenantId,
              providerId: request.providerId,
              batchId: request.batchId,
              decidedByMembershipId: command.actor.membershipId,
              decidedByUserId: command.actor.userId,
              outcome: command.outcome,
              reason: command.reason,
              movementId,
              onHandBefore,
              onHandAfter,
              resultingBatchVersion,
              idempotencyKey: command.idempotencyKey,
              commandHash,
              occurredAt,
              createdAt: occurredAt,
            },
            select: { id: true },
          });

          const eventType =
            command.outcome === 'APPROVED'
              ? 'inventory.exception.approved'
              : 'inventory.exception.rejected';
          await this.audit.appendTenantUser(transaction, {
            tenantId: request.tenantId,
            actorMembershipId: command.actor.membershipId,
            actorUserId: command.actor.userId,
            eventType,
            outcome: 'SUCCEEDED',
            resourceType: 'InventoryExceptionRequest',
            resourceId: request.id,
            occurredAt,
            request: command.request,
            metadata:
              command.outcome === 'APPROVED'
                ? {
                    providerId: request.providerId,
                    action: request.action,
                    quantity: request.quantity ?? null,
                    onHandBefore,
                    onHandAfter,
                    resultingVersion: resultingBatchVersion,
                  }
                : {
                    providerId: request.providerId,
                    action: request.action,
                    quantity: request.quantity ?? null,
                  },
          });
          await this.events.appendTenantUser(transaction, command.actor, {
            eventType,
            aggregateType: 'InventoryExceptionRequest',
            aggregateId: request.id,
            occurredAt,
            payload: {
              providerId: request.providerId,
              batchId: request.batchId,
              action: request.action,
              quantity: request.quantity ?? 0,
              outcome: command.outcome,
              movementId: movementId ?? '',
              resultingVersion: resultingBatchVersion ?? 0,
            },
          });

          return {
            decisionId,
            requestId: request.id,
            providerId: request.providerId,
            batchId: request.batchId,
            action: request.action,
            quantity: request.quantity,
            outcome: command.outcome,
            movementId,
            onHandBefore,
            onHandAfter,
            resultingBatchVersion,
            occurredAt,
            replayed: false,
          };
        },
        SERIALIZABLE_ATTEMPTS,
      );
    } catch (error) {
      if (!hasPrismaCode(error, 'P2002')) throw error;
      await assertTrustedProviderAccess(this.prisma.client, command.actor, command.providerId);
      const replay = await this.findDecisionReplay(
        this.prisma.client,
        command.actor.tenantId,
        command.providerId,
        command.idempotencyKey,
        commandHash,
      );
      if (replay) return replay;
      if (uniqueRetries > 0) return this.decide(command, uniqueRetries - 1);
      throw error;
    }
  }

  private assertActionEligible(
    action: RequestInventoryExceptionCommand['action'],
    quantity: number | undefined,
    batch: {
      status: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'QUARANTINED' | 'RECALLED';
      expiryDate: Date;
      onHandQuantity: number;
      heldQuantity: number;
    },
    now: Date,
  ): void {
    if (action === 'QUARANTINE_RELEASE') {
      if (quantity !== undefined) {
        throw new BadRequestException('Quarantine release must not specify a quantity');
      }
      if (batch.status !== 'QUARANTINED') {
        throw new ConflictException('Only a quarantined batch can be proposed for release');
      }
      if (batch.expiryDate.getTime() <= now.getTime()) {
        throw new ConflictException('Expired batch cannot be proposed for release');
      }
      return;
    }

    if (
      quantity === undefined ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_DATABASE_INTEGER
    ) {
      throw new BadRequestException('Disposition quantity must be a positive database-safe integer');
    }
    if (!['QUARANTINED', 'RECALLED', 'EXPIRED'].includes(batch.status)) {
      throw new ConflictException(
        'Physical disposition requires quarantined, recalled, or expired stock',
      );
    }
    if (batch.heldQuantity !== 0) {
      throw new ConflictException('Batch has active reservation holds');
    }
    if (quantity > batch.onHandQuantity) {
      throw new ConflictException('Disposition quantity exceeds current stock');
    }
  }

  private validateRecall(command: RecallBatchCommand): void {
    validateVersion(command.expectedVersion);
    validateKey(command.idempotencyKey);
    validateReason(command.reason);
    if (!BATCH_RECALL_REASONS.includes(command.reasonCode)) {
      throw new BadRequestException('Unsupported batch recall reason');
    }
  }

  private validateRequest(command: RequestInventoryExceptionCommand): void {
    validateVersion(command.expectedVersion);
    validateKey(command.idempotencyKey);
    validateReason(command.reason);
    if (!INVENTORY_EXCEPTION_ACTIONS.includes(command.action)) {
      throw new BadRequestException('Unsupported inventory exception action');
    }
    if (
      command.quantity !== undefined &&
      (!Number.isSafeInteger(command.quantity) ||
        command.quantity < 1 ||
        command.quantity > MAX_DATABASE_INTEGER)
    ) {
      throw new BadRequestException('Invalid inventory exception quantity');
    }
  }

  private validateDecision(command: DecideInventoryExceptionCommand): void {
    validateKey(command.idempotencyKey);
    validateReason(command.reason);
    if (!INVENTORY_EXCEPTION_DECISIONS.includes(command.outcome)) {
      throw new BadRequestException('Unsupported inventory exception decision');
    }
  }

  private hashRecall(command: RecallBatchCommand): string {
    return hash({
      tenantId: command.actor.tenantId,
      providerId: command.providerId,
      batchId: command.batchId,
      expectedVersion: command.expectedVersion,
      idempotencyKey: command.idempotencyKey,
      reasonCode: command.reasonCode,
      reason: command.reason,
    });
  }

  private hashRequest(command: RequestInventoryExceptionCommand): string {
    return hash({
      tenantId: command.actor.tenantId,
      providerId: command.providerId,
      batchId: command.batchId,
      expectedVersion: command.expectedVersion,
      action: command.action,
      quantity: command.quantity ?? null,
      idempotencyKey: command.idempotencyKey,
      reason: command.reason,
    });
  }

  private hashDecision(command: DecideInventoryExceptionCommand): string {
    return hash({
      tenantId: command.actor.tenantId,
      providerId: command.providerId,
      requestId: command.requestId,
      outcome: command.outcome,
      idempotencyKey: command.idempotencyKey,
      reason: command.reason,
    });
  }

  private async findRecallReplay(
    database: Pick<Prisma.TransactionClient, 'batchRecallRecord'>,
    tenantId: string,
    providerId: string,
    idempotencyKey: string,
    expectedHash: string,
  ): Promise<BatchRecallResult | null> {
    const record = await database.batchRecallRecord.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: {
        providerId: true,
        batchId: true,
        reasonCode: true,
        onHandQuantity: true,
        affectedReservationCount: true,
        releasedUnitCount: true,
        resultingBatchVersion: true,
        commandHash: true,
        occurredAt: true,
      },
    });
    if (!record) return null;
    if (record.providerId !== providerId || record.commandHash !== expectedHash) {
      throw new ConflictException('Idempotency key is already used by another recall command');
    }
    return {
      batchId: record.batchId,
      status: 'RECALLED',
      reasonCode: record.reasonCode,
      onHandQuantity: record.onHandQuantity,
      affectedReservationCount: record.affectedReservationCount,
      releasedUnitCount: record.releasedUnitCount,
      resultingBatchVersion: record.resultingBatchVersion,
      occurredAt: record.occurredAt,
      replayed: true,
    };
  }

  private async findRequestReplay(
    database: Pick<Prisma.TransactionClient, 'inventoryExceptionRequest'>,
    tenantId: string,
    providerId: string,
    idempotencyKey: string,
    expectedHash: string,
  ): Promise<InventoryExceptionRequestResult | null> {
    const record = await database.inventoryExceptionRequest.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: {
        id: true,
        providerId: true,
        batchId: true,
        action: true,
        quantity: true,
        requestedBatchVersion: true,
        commandHash: true,
        requestedAt: true,
      },
    });
    if (!record) return null;
    if (record.providerId !== providerId || record.commandHash !== expectedHash) {
      throw new ConflictException('Idempotency key is already used by another exception request');
    }
    return {
      requestId: record.id,
      providerId: record.providerId,
      batchId: record.batchId,
      action: record.action,
      quantity: record.quantity,
      requestedBatchVersion: record.requestedBatchVersion,
      requestedAt: record.requestedAt,
      replayed: true,
    };
  }

  private async findDecisionReplay(
    database: Pick<Prisma.TransactionClient, 'inventoryExceptionDecision'>,
    tenantId: string,
    providerId: string,
    idempotencyKey: string,
    expectedHash: string,
  ): Promise<InventoryExceptionDecisionResult | null> {
    const record = await database.inventoryExceptionDecision.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: {
        id: true,
        providerId: true,
        batchId: true,
        outcome: true,
        movementId: true,
        onHandBefore: true,
        onHandAfter: true,
        resultingBatchVersion: true,
        commandHash: true,
        occurredAt: true,
        request: { select: { id: true, action: true, quantity: true } },
      },
    });
    if (!record) return null;
    if (record.providerId !== providerId || record.commandHash !== expectedHash) {
      throw new ConflictException('Idempotency key is already used by another exception decision');
    }
    return {
      decisionId: record.id,
      requestId: record.request.id,
      providerId: record.providerId,
      batchId: record.batchId,
      action: record.request.action,
      quantity: record.request.quantity,
      outcome: record.outcome,
      movementId: record.movementId,
      onHandBefore: record.onHandBefore,
      onHandAfter: record.onHandAfter,
      resultingBatchVersion: record.resultingBatchVersion,
      occurredAt: record.occurredAt,
      replayed: true,
    };
  }
}

function validateVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DATABASE_INTEGER) {
    throw new BadRequestException('Expected version must be a positive database-safe integer');
  }
}

function validateKey(value: string): void {
  if (value.length < 8 || value.length > 120 || value.trim() !== value) {
    throw new BadRequestException('Idempotency key must contain 8 to 120 trimmed characters');
  }
}

function validateReason(value: string): void {
  if (value.length < 1 || value.length > 500 || value.trim() !== value) {
    throw new BadRequestException('Reason must contain 1 to 500 trimmed characters');
  }
}

async function databaseNow(database: Prisma.TransactionClient): Promise<Date> {
  const [{ occurredAt }] = await database.$queryRaw<Array<{ occurredAt: Date }>>(
    Prisma.sql`SELECT CURRENT_TIMESTAMP AS "occurredAt"`,
  );
  if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
    throw new Error('Database timestamp was not returned');
  }
  return occurredAt;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
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
    !Number.isSafeInteger(result) ||
    result > MAX_DATABASE_INTEGER
  ) {
    throw new ConflictException(message);
  }
  return result;
}

function movementKey(idempotencyKey: string, requestId: string): string {
  return `exception:${createHash('sha256')
    .update(`${idempotencyKey}:${requestId}`)
    .digest('hex')}`;
}
