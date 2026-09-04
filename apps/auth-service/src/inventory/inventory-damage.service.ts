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
import type { DamagedStockResult, RecordDamagedStockCommand } from './inventory-damage.types';

const DAMAGE_REFERENCE = 'inventory.stock.damage';
const MAX_DATABASE_INTEGER = 2_147_483_647;

@Injectable()
export class InventoryDamageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly events: InventoryEventWriter,
  ) {}

  async recordCompleted(
    command: RecordDamagedStockCommand,
    uniqueRetries = 2,
  ): Promise<DamagedStockResult> {
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
        if (!occurredAt) throw new Error('Database timestamp was not returned');

        const batch = await transaction.batch.findFirst({
          where: {
            id: command.batchId,
            tenantId: command.actor.tenantId,
            providerId: command.providerId,
            status: 'ACTIVE',
            deletedAt: null,
            inventory: { deletedAt: null },
            provider: { isActive: true, deletedAt: null },
            product: { isActive: true, deletedAt: null },
          },
          select: {
            id: true,
            inventoryId: true,
            productId: true,
            expiryDate: true,
            receivedQuantity: true,
            onHandQuantity: true,
            heldQuantity: true,
            version: true,
          },
        });
        if (!batch) throw new NotFoundException('Assigned provider batch not found');
        if (batch.expiryDate.getTime() <= occurredAt.getTime()) {
          throw new ConflictException('Batch is expired');
        }
        if (batch.version !== command.expectedVersion) {
          throw new ConflictException('Batch version conflict');
        }

        const availableQuantity = batch.onHandQuantity - batch.heldQuantity;
        if (!Number.isSafeInteger(availableQuantity) || command.quantity > availableQuantity) {
          throw new ConflictException('Damage quantity exceeds available stock');
        }

        const onHandAfter = batch.onHandQuantity - command.quantity;
        if (
          !Number.isSafeInteger(onHandAfter) ||
          onHandAfter < batch.heldQuantity ||
          onHandAfter > batch.receivedQuantity
        ) {
          throw new ConflictException('Damage quantity violates batch stock integrity');
        }

        const resultingBatchVersion = batch.version + 1;
        if (
          !Number.isSafeInteger(resultingBatchVersion) ||
          resultingBatchVersion > MAX_DATABASE_INTEGER
        ) {
          throw new ConflictException('Batch version limit exceeded');
        }

        const updated = await transaction.batch.updateMany({
          where: {
            id: batch.id,
            tenantId: command.actor.tenantId,
            inventoryId: batch.inventoryId,
            providerId: command.providerId,
            productId: batch.productId,
            version: batch.version,
            receivedQuantity: batch.receivedQuantity,
            onHandQuantity: batch.onHandQuantity,
            heldQuantity: batch.heldQuantity,
            status: 'ACTIVE',
            deletedAt: null,
          },
          data: {
            onHandQuantity: onHandAfter,
            status: onHandAfter === 0 && batch.heldQuantity === 0 ? 'EXHAUSTED' : 'ACTIVE',
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new SerializableRetryError('Concurrent batch update detected');
        }

        const movementId = randomUUID();
        await transaction.stockMovement.create({
          data: {
            id: movementId,
            tenantId: command.actor.tenantId,
            inventoryId: batch.inventoryId,
            batchId: batch.id,
            providerId: command.providerId,
            productId: batch.productId,
            type: 'DAMAGED',
            delta: -command.quantity,
            onHandBefore: batch.onHandQuantity,
            onHandAfter,
            referenceType: DAMAGE_REFERENCE,
            referenceId: batch.id,
            reason: command.reason,
            idempotencyKey: command.idempotencyKey,
            commandHash,
            resultingBatchVersion,
            actorType: 'TENANT_USER',
            actorMembershipId: command.actor.membershipId,
            occurredAt,
          },
          select: { id: true },
        });

        await this.audit.appendTenantUser(transaction, {
          tenantId: command.actor.tenantId,
          actorMembershipId: command.actor.membershipId,
          actorUserId: command.actor.userId,
          eventType: 'inventory.stock.damaged',
          outcome: 'SUCCEEDED',
          resourceType: 'Batch',
          resourceId: batch.id,
          occurredAt,
          metadata: {
            productId: batch.productId,
            quantity: command.quantity,
            onHandBefore: batch.onHandQuantity,
            onHandAfter,
          },
          request: command.request,
        });
        await this.events.appendTenantUser(transaction, command.actor, {
          eventType: 'inventory.stock.damaged',
          aggregateType: 'Batch',
          aggregateId: batch.id,
          occurredAt,
          payload: {
            providerId: command.providerId,
            inventoryId: batch.inventoryId,
            productId: batch.productId,
            quantity: command.quantity,
            onHandBefore: batch.onHandQuantity,
            onHandAfter,
            version: resultingBatchVersion,
          },
        });

        return {
          providerId: command.providerId,
          inventoryId: batch.inventoryId,
          productId: batch.productId,
          batchId: batch.id,
          movementId,
          quantity: command.quantity,
          onHandBefore: batch.onHandQuantity,
          onHandAfter,
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
      if (uniqueRetries > 0) return this.recordCompleted(command, uniqueRetries - 1);
      throw error;
    }
  }

  private async findReplay(
    database: Pick<Prisma.TransactionClient, 'stockMovement'>,
    tenantId: string,
    idempotencyKey: string,
    expectedCommandHash: string,
  ): Promise<DamagedStockResult | null> {
    const movement = await database.stockMovement.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: {
        id: true,
        providerId: true,
        inventoryId: true,
        productId: true,
        batchId: true,
        type: true,
        delta: true,
        onHandBefore: true,
        onHandAfter: true,
        referenceType: true,
        referenceId: true,
        commandHash: true,
        resultingBatchVersion: true,
        occurredAt: true,
      },
    });
    if (!movement) return null;
    if (
      movement.type !== 'DAMAGED' ||
      movement.referenceType !== DAMAGE_REFERENCE ||
      movement.referenceId !== movement.batchId ||
      movement.commandHash !== expectedCommandHash ||
      movement.resultingBatchVersion === null ||
      movement.delta >= 0
    ) {
      throw new ConflictException('Idempotency key is already used by another command');
    }

    return {
      providerId: movement.providerId,
      inventoryId: movement.inventoryId,
      productId: movement.productId,
      batchId: movement.batchId,
      movementId: movement.id,
      quantity: -movement.delta,
      onHandBefore: movement.onHandBefore,
      onHandAfter: movement.onHandAfter,
      resultingBatchVersion: movement.resultingBatchVersion,
      occurredAt: movement.occurredAt,
      replayed: true,
    };
  }

  private validate(command: RecordDamagedStockCommand): void {
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) {
      throw new BadRequestException('Expected version must be a positive safe integer');
    }
    if (
      !Number.isSafeInteger(command.quantity) ||
      command.quantity < 1 ||
      command.quantity > MAX_DATABASE_INTEGER
    ) {
      throw new BadRequestException('Damage quantity must be a positive database-safe integer');
    }
    if (
      command.idempotencyKey.length < 1 ||
      command.idempotencyKey.length > 120 ||
      command.idempotencyKey.trim() !== command.idempotencyKey
    ) {
      throw new BadRequestException('Idempotency key must contain 1 to 120 characters');
    }
    if (
      command.reason.length < 1 ||
      command.reason.length > 500 ||
      command.reason.trim() !== command.reason
    ) {
      throw new BadRequestException('Damage reason must contain 1 to 500 characters');
    }
  }

  private hash(command: RecordDamagedStockCommand): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: command.actor.tenantId,
          providerId: command.providerId,
          batchId: command.batchId,
          expectedVersion: command.expectedVersion,
          quantity: command.quantity,
          idempotencyKey: command.idempotencyKey,
          reason: command.reason,
        }),
      )
      .digest('hex');
  }
}
