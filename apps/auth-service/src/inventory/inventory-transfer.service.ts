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
import type {
  CompletedTransferResult,
  RecordCompletedTransferCommand,
} from './inventory-transfer.types';

const REFERENCE = 'inventory.stock.transfer';
const MAX_INT = 2_147_483_647;

@Injectable()
export class InventoryTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly events: InventoryEventWriter,
  ) {}

  async recordCompleted(
    command: RecordCompletedTransferCommand,
    uniqueRetries = 2,
  ): Promise<CompletedTransferResult> {
    this.validate(command);
    const commandHash = this.hash(command);
    try {
      return await withSerializableRetry(this.prisma.client, async (tx) => {
        await assertTrustedProviderAccess(tx, command.actor, command.sourceProviderId);
        await assertTrustedProviderAccess(tx, command.actor, command.destinationProviderId);
        const replay = await this.replay(
          tx,
          command.actor.tenantId,
          command.idempotencyKey,
          commandHash,
        );
        if (replay) return replay;
        const [{ completedAt }] = await tx.$queryRaw<Array<{ completedAt: Date }>>(
          Prisma.sql`SELECT CURRENT_TIMESTAMP AS "completedAt"`,
        );
        if (!completedAt) throw new Error('Database timestamp was not returned');

        const source = await tx.batch.findFirst({
          where: {
            id: command.sourceBatchId,
            tenantId: command.actor.tenantId,
            providerId: command.sourceProviderId,
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
            batchNumber: true,
            manufacturingDate: true,
            expiryDate: true,
            receivedQuantity: true,
            onHandQuantity: true,
            heldQuantity: true,
            purchasePrice: true,
            sellingPrice: true,
            version: true,
          },
        });
        if (!source) throw new NotFoundException('Assigned provider batch not found');
        if (source.expiryDate.getTime() <= completedAt.getTime())
          throw new ConflictException('Source batch is expired');
        if (source.version !== command.expectedSourceVersion)
          throw new ConflictException('Source batch version conflict');
        const available = source.onHandQuantity - source.heldQuantity;
        if (!Number.isSafeInteger(available) || available < command.quantity)
          throw new ConflictException('Insufficient available source stock');

        const destinationInventory = await tx.inventory.findFirst({
          where: {
            tenantId: command.actor.tenantId,
            providerId: command.destinationProviderId,
            productId: source.productId,
            deletedAt: null,
            provider: { isActive: true, deletedAt: null },
            product: { isActive: true, deletedAt: null },
          },
          select: { id: true },
        });
        if (!destinationInventory)
          throw new NotFoundException('Destination inventory listing not found');

        const sourceAfter = source.onHandQuantity - command.quantity;
        const sourceUpdate = await tx.batch.updateMany({
          where: {
            id: source.id,
            tenantId: command.actor.tenantId,
            providerId: command.sourceProviderId,
            version: source.version,
            onHandQuantity: source.onHandQuantity,
            heldQuantity: source.heldQuantity,
            status: 'ACTIVE',
            deletedAt: null,
          },
          data: {
            onHandQuantity: sourceAfter,
            status: sourceAfter === 0 && source.heldQuantity === 0 ? 'EXHAUSTED' : 'ACTIVE',
            version: { increment: 1 },
          },
        });
        if (sourceUpdate.count !== 1)
          throw new SerializableRetryError('Concurrent source batch update detected');

        const destination = await tx.batch.findUnique({
          where: {
            tenantId_providerId_productId_batchNumber: {
              tenantId: command.actor.tenantId,
              providerId: command.destinationProviderId,
              productId: source.productId,
              batchNumber: source.batchNumber,
            },
          },
          select: {
            id: true,
            inventoryId: true,
            manufacturingDate: true,
            expiryDate: true,
            receivedQuantity: true,
            onHandQuantity: true,
            heldQuantity: true,
            purchasePrice: true,
            sellingPrice: true,
            status: true,
            version: true,
            deletedAt: true,
          },
        });
        let destinationBatchId: string;
        let destinationAfter: number;
        let destinationVersion: number;
        if (destination) {
          const datesMatch =
            destination.manufacturingDate?.getTime() === source.manufacturingDate?.getTime() &&
            destination.expiryDate.getTime() === source.expiryDate.getTime();
          if (
            destination.deletedAt ||
            destination.inventoryId !== destinationInventory.id ||
            destination.status === 'EXPIRED' ||
            destination.expiryDate.getTime() <= completedAt.getTime() ||
            !datesMatch ||
            !destination.purchasePrice.equals(source.purchasePrice) ||
            !destination.sellingPrice.equals(source.sellingPrice)
          )
            throw new ConflictException('Destination batch provenance conflict');
          destinationAfter = destination.onHandQuantity + command.quantity;
          const receivedAfter = destination.receivedQuantity + command.quantity;
          if (destinationAfter > MAX_INT || receivedAfter > MAX_INT)
            throw new ConflictException('Destination quantity limit exceeded');
          const updated = await tx.batch.updateMany({
            where: {
              id: destination.id,
              tenantId: command.actor.tenantId,
              inventoryId: destinationInventory.id,
              providerId: command.destinationProviderId,
              version: destination.version,
              receivedQuantity: destination.receivedQuantity,
              onHandQuantity: destination.onHandQuantity,
              heldQuantity: destination.heldQuantity,
              status: destination.status,
              deletedAt: null,
            },
            data: {
              receivedQuantity: receivedAfter,
              onHandQuantity: destinationAfter,
              status: 'ACTIVE',
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1)
            throw new SerializableRetryError('Concurrent destination batch update detected');
          destinationBatchId = destination.id;
          destinationVersion = destination.version + 1;
        } else {
          destinationBatchId = randomUUID();
          destinationAfter = command.quantity;
          destinationVersion = 1;
          await tx.batch.create({
            data: {
              id: destinationBatchId,
              tenantId: command.actor.tenantId,
              inventoryId: destinationInventory.id,
              providerId: command.destinationProviderId,
              productId: source.productId,
              batchNumber: source.batchNumber,
              manufacturingDate: source.manufacturingDate,
              expiryDate: source.expiryDate,
              receivedQuantity: command.quantity,
              onHandQuantity: command.quantity,
              heldQuantity: 0,
              purchasePrice: source.purchasePrice,
              sellingPrice: source.sellingPrice,
              status: 'ACTIVE',
            },
            select: { id: true },
          });
        }

        const transferId = randomUUID(),
          sourceMovementId = randomUUID(),
          destinationMovementId = randomUUID();
        const movementKey = (direction: string) =>
          `transfer-${direction}:${createHash('sha256').update(`${command.actor.tenantId}:${command.idempotencyKey}`).digest('hex')}`;
        await tx.stockMovement.createMany({
          data: [
            {
              id: sourceMovementId,
              tenantId: command.actor.tenantId,
              inventoryId: source.inventoryId,
              batchId: source.id,
              providerId: command.sourceProviderId,
              productId: source.productId,
              type: 'TRANSFER_OUT',
              delta: -command.quantity,
              onHandBefore: source.onHandQuantity,
              onHandAfter: sourceAfter,
              referenceType: REFERENCE,
              referenceId: transferId,
              reason: command.reason,
              idempotencyKey: movementKey('out'),
              commandHash,
              actorType: 'TENANT_USER',
              actorMembershipId: command.actor.membershipId,
              occurredAt: completedAt,
            },
            {
              id: destinationMovementId,
              tenantId: command.actor.tenantId,
              inventoryId: destinationInventory.id,
              batchId: destinationBatchId,
              providerId: command.destinationProviderId,
              productId: source.productId,
              type: 'TRANSFER_IN',
              delta: command.quantity,
              onHandBefore: destinationAfter - command.quantity,
              onHandAfter: destinationAfter,
              referenceType: REFERENCE,
              referenceId: transferId,
              reason: command.reason,
              idempotencyKey: movementKey('in'),
              commandHash,
              actorType: 'TENANT_USER',
              actorMembershipId: command.actor.membershipId,
              occurredAt: completedAt,
            },
          ],
        });
        await tx.inventoryTransfer.create({
          data: {
            id: transferId,
            tenantId: command.actor.tenantId,
            sourceProviderId: command.sourceProviderId,
            destinationProviderId: command.destinationProviderId,
            productId: source.productId,
            sourceInventoryId: source.inventoryId,
            destinationInventoryId: destinationInventory.id,
            sourceBatchId: source.id,
            destinationBatchId,
            quantity: command.quantity,
            idempotencyKey: command.idempotencyKey,
            commandHash,
            sourceOnHandAfter: sourceAfter,
            destinationOnHandAfter: destinationAfter,
            sourceBatchVersion: source.version + 1,
            destinationBatchVersion: destinationVersion,
            sourceMovementId,
            destinationMovementId,
            completedAt,
          },
          select: { id: true },
        });
        await this.audit.appendTenantUser(tx, {
          tenantId: command.actor.tenantId,
          actorMembershipId: command.actor.membershipId,
          eventType: 'inventory.stock.transferred',
          outcome: 'SUCCEEDED',
          resourceType: 'InventoryTransfer',
          resourceId: transferId,
          occurredAt: completedAt,
          metadata: {
            sourceProviderId: command.sourceProviderId,
            destinationProviderId: command.destinationProviderId,
            productId: source.productId,
            quantity: command.quantity,
          },
          request: command.request,
        });
        await this.events.appendTenantUser(tx, command.actor, {
          eventType: 'inventory.stock.transferred',
          aggregateType: 'InventoryTransfer',
          aggregateId: transferId,
          occurredAt: completedAt,
          payload: {
            sourceProviderId: command.sourceProviderId,
            destinationProviderId: command.destinationProviderId,
            productId: source.productId,
            quantity: command.quantity,
            sourceBatchId: source.id,
            destinationBatchId,
          },
        });
        return {
          transferId,
          productId: source.productId,
          sourceProviderId: command.sourceProviderId,
          destinationProviderId: command.destinationProviderId,
          sourceInventoryId: source.inventoryId,
          destinationInventoryId: destinationInventory.id,
          sourceBatchId: source.id,
          destinationBatchId,
          sourceMovementId,
          destinationMovementId,
          quantity: command.quantity,
          sourceOnHandAfter: sourceAfter,
          destinationOnHandAfter: destinationAfter,
          sourceBatchVersion: source.version + 1,
          destinationBatchVersion: destinationVersion,
          completedAt,
          replayed: false,
        };
      });
    } catch (error) {
      if (!hasPrismaCode(error, 'P2002')) throw error;
      await assertTrustedProviderAccess(
        this.prisma.client,
        command.actor,
        command.sourceProviderId,
      );
      await assertTrustedProviderAccess(
        this.prisma.client,
        command.actor,
        command.destinationProviderId,
      );
      const replay = await this.replay(
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

  private async replay(
    db: Pick<Prisma.TransactionClient, 'inventoryTransfer'>,
    tenantId: string,
    idempotencyKey: string,
    hash: string,
  ): Promise<CompletedTransferResult | null> {
    const r = await db.inventoryTransfer.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: {
        id: true,
        productId: true,
        sourceProviderId: true,
        destinationProviderId: true,
        sourceInventoryId: true,
        destinationInventoryId: true,
        sourceBatchId: true,
        destinationBatchId: true,
        sourceMovementId: true,
        destinationMovementId: true,
        quantity: true,
        commandHash: true,
        sourceOnHandAfter: true,
        destinationOnHandAfter: true,
        sourceBatchVersion: true,
        destinationBatchVersion: true,
        completedAt: true,
      },
    });
    if (!r) return null;
    if (r.commandHash !== hash)
      throw new ConflictException('Idempotency key is already used by another transfer');
    return {
      transferId: r.id,
      productId: r.productId,
      sourceProviderId: r.sourceProviderId,
      destinationProviderId: r.destinationProviderId,
      sourceInventoryId: r.sourceInventoryId,
      destinationInventoryId: r.destinationInventoryId,
      sourceBatchId: r.sourceBatchId,
      destinationBatchId: r.destinationBatchId,
      sourceMovementId: r.sourceMovementId,
      destinationMovementId: r.destinationMovementId,
      quantity: r.quantity,
      sourceOnHandAfter: r.sourceOnHandAfter,
      destinationOnHandAfter: r.destinationOnHandAfter,
      sourceBatchVersion: r.sourceBatchVersion,
      destinationBatchVersion: r.destinationBatchVersion,
      completedAt: r.completedAt,
      replayed: true,
    };
  }

  private validate(c: RecordCompletedTransferCommand) {
    if (c.sourceProviderId === c.destinationProviderId)
      throw new BadRequestException('Source and destination providers must be different');
    if (!Number.isSafeInteger(c.expectedSourceVersion) || c.expectedSourceVersion < 1)
      throw new BadRequestException('Expected source version must be a positive safe integer');
    if (!Number.isSafeInteger(c.quantity) || c.quantity < 1 || c.quantity > MAX_INT)
      throw new BadRequestException('Transfer quantity must be a positive database-safe integer');
    if (c.idempotencyKey.length < 1 || c.idempotencyKey.length > 120)
      throw new BadRequestException('Idempotency key must contain 1 to 120 characters');
    if (c.reason !== undefined && (c.reason.length < 1 || c.reason.length > 500))
      throw new BadRequestException('Reason must contain 1 to 500 characters');
  }
  private hash(c: RecordCompletedTransferCommand) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: c.actor.tenantId,
          sourceProviderId: c.sourceProviderId,
          destinationProviderId: c.destinationProviderId,
          sourceBatchId: c.sourceBatchId,
          expectedSourceVersion: c.expectedSourceVersion,
          quantity: c.quantity,
          idempotencyKey: c.idempotencyKey,
          reason: c.reason ?? null,
        }),
      )
      .digest('hex');
  }
}
