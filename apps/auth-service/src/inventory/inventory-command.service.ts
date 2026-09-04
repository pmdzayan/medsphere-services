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
import type {
  AdjustBatchCommand,
  ConfigureInventoryCommand,
  InventoryConfigurationResult,
  ReceiveBatchCommand,
  StockMutationResult,
  TrustedInventoryActor,
} from './inventory-command.types';

const RECEIVE_REFERENCE = 'inventory.batch.receive';
const ADJUST_REFERENCE = 'inventory.stock.adjustment';

@Injectable()
export class InventoryCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async configureInventory(
    command: ConfigureInventoryCommand,
  ): Promise<InventoryConfigurationResult> {
    const normalized = this.validateConfiguration(command);
    const configurationHash = createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: command.actor.tenantId,
          providerId: command.providerId,
          productId: command.productId,
          expectedVersion: command.expectedVersion ?? null,
          sku: command.sku ?? null,
          ...normalized,
          minimumStockLevel: command.minimumStockLevel,
          isVisible: command.isVisible,
        }),
      )
      .digest('hex');

    try {
      return await withSerializableRetry(this.prisma.client, async (transaction) => {
        await assertTrustedProviderAccess(transaction, command.actor, command.providerId);
        const replay = await this.findConfigurationReplay(
          transaction,
          command.actor.tenantId,
          command.idempotencyKey,
          configurationHash,
        );
        if (replay) return replay;

        const [provider, product] = await Promise.all([
          transaction.provider.findFirst({
            where: {
              id: command.providerId,
              tenantId: command.actor.tenantId,
              isActive: true,
              deletedAt: null,
            },
            select: { id: true },
          }),
          transaction.product.findFirst({
            where: { id: command.productId, isActive: true, deletedAt: null },
            select: { id: true },
          }),
        ]);
        if (!provider || !product) {
          throw new NotFoundException('Active provider or product not found');
        }

        const existing = await transaction.inventory.findUnique({
          where: {
            tenantId_providerId_productId: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              productId: command.productId,
            },
          },
          select: { id: true, version: true, deletedAt: true },
        });
        let inventoryId: string;
        let resultingVersion: number;
        const data = {
          sku: command.sku,
          sellingPrice: normalized.sellingPrice,
          mrp: normalized.mrp,
          discountPercentage: normalized.discountPercentage,
          taxPercentage: normalized.taxPercentage,
          minimumStockLevel: command.minimumStockLevel,
          isVisible: command.isVisible,
        };

        if (!existing) {
          if (command.expectedVersion !== undefined) {
            throw new ConflictException('Inventory listing does not exist at expected version');
          }
          inventoryId = randomUUID();
          resultingVersion = 1;
          await transaction.inventory.create({
            data: {
              id: inventoryId,
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              productId: command.productId,
              ...data,
            },
            select: { id: true },
          });
        } else {
          if (existing.deletedAt || command.expectedVersion !== existing.version) {
            throw new ConflictException('Inventory listing version conflict');
          }
          inventoryId = existing.id;
          resultingVersion = existing.version + 1;
          const updated = await transaction.inventory.updateMany({
            where: {
              id: existing.id,
              tenantId: command.actor.tenantId,
              version: existing.version,
              deletedAt: null,
            },
            data: { ...data, version: { increment: 1 } },
          });
          if (updated.count !== 1) {
            throw new SerializableRetryError('Concurrent inventory configuration update detected');
          }
        }

        await this.audit.appendTenantUser(transaction, {
          tenantId: command.actor.tenantId,
          actorMembershipId: command.actor.membershipId,
          actorUserId: command.actor.userId,
          eventType: 'inventory.listing.configured',
          outcome: 'SUCCEEDED',
          resourceType: 'Inventory',
          resourceId: inventoryId,
          metadata: { productId: command.productId, version: resultingVersion },
          request: command.request,
        });
        await transaction.inventoryConfigurationCommand.create({
          data: {
            id: randomUUID(),
            tenantId: command.actor.tenantId,
            inventoryId,
            idempotencyKey: command.idempotencyKey,
            configurationHash,
            resultingVersion,
          },
          select: { id: true },
        });
        return { inventoryId, version: resultingVersion, replayed: false };
      });
    } catch (error) {
      if (!hasPrismaCode(error, 'P2002')) throw error;
      await assertTrustedProviderAccess(this.prisma.client, command.actor, command.providerId);
      const replay = await this.findConfigurationReplay(
        this.prisma.client,
        command.actor.tenantId,
        command.idempotencyKey,
        configurationHash,
      );
      if (!replay) throw error;
      return replay;
    }
  }

  async receiveBatch(command: ReceiveBatchCommand): Promise<StockMutationResult> {
    this.validateReceive(command);
    const commandHash = this.receiveCommandHash(command);
    return this.executeIdempotent(
      command.actor,
      command.providerId,
      command.idempotencyKey,
      commandHash,
      'STOCK_IN',
      RECEIVE_REFERENCE,
      () =>
        withSerializableRetry(this.prisma.client, async (transaction) => {
          await assertTrustedProviderAccess(transaction, command.actor, command.providerId);
          const replay = await this.findReplay(
            transaction,
            command.actor.tenantId,
            command.idempotencyKey,
            commandHash,
            'STOCK_IN',
            RECEIVE_REFERENCE,
          );
          if (replay) return replay;

          const inventory = await transaction.inventory.findFirst({
            where: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              productId: command.productId,
              deletedAt: null,
              provider: { isActive: true, deletedAt: null },
              product: { isActive: true, deletedAt: null },
            },
            select: { id: true },
          });
          if (!inventory) {
            throw new NotFoundException('Active inventory listing not found in tenant');
          }

          const duplicate = await transaction.batch.findUnique({
            where: {
              tenantId_providerId_productId_batchNumber: {
                tenantId: command.actor.tenantId,
                providerId: command.providerId,
                productId: command.productId,
                batchNumber: command.batchNumber,
              },
            },
            select: { id: true },
          });
          if (duplicate) {
            throw new ConflictException(
              'Batch number already exists for this provider and product',
            );
          }

          const batchId = randomUUID();
          const movementId = randomUUID();
          await transaction.batch.create({
            data: {
              id: batchId,
              tenantId: command.actor.tenantId,
              inventoryId: inventory.id,
              providerId: command.providerId,
              productId: command.productId,
              batchNumber: command.batchNumber,
              manufacturingDate: command.manufacturingDate,
              expiryDate: command.expiryDate,
              receivedQuantity: command.quantity,
              onHandQuantity: command.quantity,
              heldQuantity: 0,
              purchasePrice: new Prisma.Decimal(command.purchasePrice),
              sellingPrice: new Prisma.Decimal(command.sellingPrice),
              status: 'ACTIVE',
            },
            select: { id: true },
          });
          await transaction.stockMovement.create({
            data: {
              id: movementId,
              tenantId: command.actor.tenantId,
              inventoryId: inventory.id,
              batchId,
              providerId: command.providerId,
              productId: command.productId,
              type: 'STOCK_IN',
              delta: command.quantity,
              onHandBefore: 0,
              onHandAfter: command.quantity,
              referenceType: RECEIVE_REFERENCE,
              referenceId: batchId,
              reason: command.reason,
              idempotencyKey: command.idempotencyKey,
              commandHash,
              actorType: 'TENANT_USER',
              actorMembershipId: command.actor.membershipId,
            },
            select: { id: true },
          });
          await this.audit.appendTenantUser(transaction, {
            tenantId: command.actor.tenantId,
            actorMembershipId: command.actor.membershipId,
            actorUserId: command.actor.userId,
            eventType: 'inventory.batch.received',
            outcome: 'SUCCEEDED',
            resourceType: 'Batch',
            resourceId: batchId,
            metadata: { productId: command.productId, quantity: command.quantity },
            request: command.request,
          });

          return {
            inventoryId: inventory.id,
            batchId,
            movementId,
            onHandBefore: 0,
            onHandAfter: command.quantity,
            batchVersion: 1,
            replayed: false,
          };
        }),
    );
  }

  async adjustBatch(command: AdjustBatchCommand): Promise<StockMutationResult> {
    this.validateAdjustment(command);
    const commandHash = this.adjustCommandHash(command);
    return this.executeIdempotent(
      command.actor,
      command.providerId,
      command.idempotencyKey,
      commandHash,
      'ADJUSTMENT',
      ADJUST_REFERENCE,
      () =>
        withSerializableRetry(this.prisma.client, async (transaction) => {
          await assertTrustedProviderAccess(transaction, command.actor, command.providerId);
          const replay = await this.findReplay(
            transaction,
            command.actor.tenantId,
            command.idempotencyKey,
            commandHash,
            'ADJUSTMENT',
            ADJUST_REFERENCE,
          );
          if (replay) return replay;

          const batch = await transaction.batch.findFirst({
            where: {
              id: command.batchId,
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              deletedAt: null,
            },
            select: {
              id: true,
              inventoryId: true,
              productId: true,
              receivedQuantity: true,
              onHandQuantity: true,
              heldQuantity: true,
              expiryDate: true,
              version: true,
            },
          });
          if (!batch) {
            throw new NotFoundException('Batch not found in tenant');
          }
          if (batch.version !== command.expectedVersion) {
            throw new ConflictException('Batch version conflict');
          }

          const onHandAfter = batch.onHandQuantity + command.delta;
          if (onHandAfter < batch.heldQuantity) {
            throw new ConflictException('Adjustment would consume held stock');
          }
          if (onHandAfter > batch.receivedQuantity) {
            throw new BadRequestException('Adjustment cannot exceed received quantity');
          }

          const status =
            batch.expiryDate.getTime() <= Date.now()
              ? 'EXPIRED'
              : onHandAfter === 0
                ? 'EXHAUSTED'
                : 'ACTIVE';
          const updated = await transaction.batch.updateMany({
            where: {
              id: batch.id,
              tenantId: command.actor.tenantId,
              version: batch.version,
              onHandQuantity: batch.onHandQuantity,
              heldQuantity: batch.heldQuantity,
            },
            data: {
              onHandQuantity: onHandAfter,
              status,
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
              type: 'ADJUSTMENT',
              delta: command.delta,
              onHandBefore: batch.onHandQuantity,
              onHandAfter,
              referenceType: ADJUST_REFERENCE,
              referenceId: batch.id,
              reason: command.reason,
              idempotencyKey: command.idempotencyKey,
              commandHash,
              actorType: 'TENANT_USER',
              actorMembershipId: command.actor.membershipId,
            },
            select: { id: true },
          });
          await this.audit.appendTenantUser(transaction, {
            tenantId: command.actor.tenantId,
            actorMembershipId: command.actor.membershipId,
            actorUserId: command.actor.userId,
            eventType: 'inventory.stock.adjusted',
            outcome: 'SUCCEEDED',
            resourceType: 'Batch',
            resourceId: batch.id,
            metadata: {
              productId: batch.productId,
              delta: command.delta,
              onHandBefore: batch.onHandQuantity,
              onHandAfter,
            },
            request: command.request,
          });

          return {
            inventoryId: batch.inventoryId,
            batchId: batch.id,
            movementId,
            onHandBefore: batch.onHandQuantity,
            onHandAfter,
            batchVersion: batch.version + 1,
            replayed: false,
          };
        }),
    );
  }

  private async executeIdempotent(
    actor: TrustedInventoryActor,
    providerId: string,
    idempotencyKey: string,
    commandHash: string,
    expectedType: 'STOCK_IN' | 'ADJUSTMENT',
    expectedReferenceType: string,
    operation: () => Promise<StockMutationResult>,
  ): Promise<StockMutationResult> {
    try {
      return await operation();
    } catch (error) {
      if (!hasPrismaCode(error, 'P2002')) throw error;
      await assertTrustedProviderAccess(this.prisma.client, actor, providerId);
      const replay = await this.findReplay(
        this.prisma.client,
        actor.tenantId,
        idempotencyKey,
        commandHash,
        expectedType,
        expectedReferenceType,
      );
      if (!replay) throw error;
      return replay;
    }
  }

  private async findConfigurationReplay(
    database: Pick<Prisma.TransactionClient, 'inventoryConfigurationCommand'>,
    tenantId: string,
    idempotencyKey: string,
    configurationHash: string,
  ): Promise<InventoryConfigurationResult | null> {
    const receipt = await database.inventoryConfigurationCommand.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: { inventoryId: true, configurationHash: true, resultingVersion: true },
    });
    if (!receipt) return null;
    if (receipt.configurationHash !== configurationHash) {
      throw new ConflictException('Idempotency key is already used by another configuration');
    }
    return {
      inventoryId: receipt.inventoryId,
      version: receipt.resultingVersion,
      replayed: true,
    };
  }

  private async findReplay(
    database: Pick<Prisma.TransactionClient, 'stockMovement'>,
    tenantId: string,
    idempotencyKey: string,
    expectedCommandHash: string,
    expectedType: 'STOCK_IN' | 'ADJUSTMENT' | undefined,
    expectedReferenceType: string | undefined,
  ): Promise<StockMutationResult | null> {
    const movement = await database.stockMovement.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: {
        id: true,
        type: true,
        inventoryId: true,
        batchId: true,
        delta: true,
        onHandBefore: true,
        onHandAfter: true,
        referenceType: true,
        referenceId: true,
        commandHash: true,
        batch: { select: { version: true } },
      },
    });
    if (!movement) return null;
    if (
      (expectedType !== undefined && movement.type !== expectedType) ||
      (expectedReferenceType !== undefined && movement.referenceType !== expectedReferenceType) ||
      movement.referenceId !== movement.batchId ||
      movement.commandHash !== expectedCommandHash
    ) {
      throw new ConflictException('Idempotency key is already used by another command');
    }
    return {
      inventoryId: movement.inventoryId,
      batchId: movement.batchId,
      movementId: movement.id,
      onHandBefore: movement.onHandBefore,
      onHandAfter: movement.onHandAfter,
      batchVersion: movement.batch.version,
      replayed: true,
    };
  }

  private validateReceive(command: ReceiveBatchCommand): void {
    this.validateIdempotencyKey(command.idempotencyKey);
    if (command.batchNumber.length === 0 || command.batchNumber.length > 120) {
      throw new BadRequestException('Batch number must contain 1 to 120 characters');
    }
    if (!Number.isSafeInteger(command.quantity) || command.quantity <= 0) {
      throw new BadRequestException('Received quantity must be a positive safe integer');
    }
    if (Number.isNaN(command.expiryDate.getTime()) || command.expiryDate.getTime() <= Date.now()) {
      throw new BadRequestException('Expiry date must be in the future');
    }
    if (
      command.manufacturingDate &&
      (Number.isNaN(command.manufacturingDate.getTime()) ||
        command.manufacturingDate.getTime() > Date.now() ||
        command.manufacturingDate.getTime() >= command.expiryDate.getTime())
    ) {
      throw new BadRequestException('Manufacturing date cannot be in the future or after expiry');
    }
    this.nonNegativeDecimal(command.purchasePrice, 'Purchase price');
    this.nonNegativeDecimal(command.sellingPrice, 'Selling price');
    if (command.reason !== undefined && command.reason.length > 500) {
      throw new BadRequestException('Reason cannot exceed 500 characters');
    }
  }

  private receiveCommandHash(command: ReceiveBatchCommand): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: command.actor.tenantId,
          providerId: command.providerId,
          productId: command.productId,
          batchNumber: command.batchNumber,
          manufacturingDate: command.manufacturingDate?.toISOString() ?? null,
          expiryDate: command.expiryDate.toISOString(),
          quantity: command.quantity,
          purchasePrice: command.purchasePrice,
          sellingPrice: command.sellingPrice,
          reason: command.reason ?? null,
        }),
      )
      .digest('hex');
  }

  private adjustCommandHash(command: AdjustBatchCommand): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: command.actor.tenantId,
          providerId: command.providerId,
          batchId: command.batchId,
          expectedVersion: command.expectedVersion,
          delta: command.delta,
          reason: command.reason,
        }),
      )
      .digest('hex');
  }

  private validateConfiguration(command: ConfigureInventoryCommand): {
    sellingPrice: Prisma.Decimal;
    mrp: Prisma.Decimal;
    discountPercentage: Prisma.Decimal;
    taxPercentage: Prisma.Decimal;
  } {
    this.validateIdempotencyKey(command.idempotencyKey);
    if (
      command.expectedVersion !== undefined &&
      (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1)
    ) {
      throw new BadRequestException('Expected version must be a positive safe integer');
    }
    if (command.sku !== undefined && (command.sku.length === 0 || command.sku.length > 120)) {
      throw new BadRequestException('SKU must contain 1 to 120 characters');
    }
    if (!Number.isSafeInteger(command.minimumStockLevel) || command.minimumStockLevel < 0) {
      throw new BadRequestException('Minimum stock level must be a non-negative safe integer');
    }

    const sellingPrice = this.decimalInRange(command.sellingPrice, 'Selling price');
    const mrp = this.decimalInRange(command.mrp, 'MRP');
    const discountPercentage = this.decimalInRange(
      command.discountPercentage,
      'Discount percentage',
      new Prisma.Decimal(100),
    );
    const taxPercentage = this.decimalInRange(
      command.taxPercentage,
      'Tax percentage',
      new Prisma.Decimal(100),
    );
    return { sellingPrice, mrp, discountPercentage, taxPercentage };
  }

  private validateAdjustment(command: AdjustBatchCommand): void {
    this.validateIdempotencyKey(command.idempotencyKey);
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) {
      throw new BadRequestException('Expected version must be a positive safe integer');
    }
    if (!Number.isSafeInteger(command.delta) || command.delta === 0) {
      throw new BadRequestException('Adjustment delta must be a non-zero safe integer');
    }
    if (command.reason.length === 0 || command.reason.length > 500) {
      throw new BadRequestException('Adjustment reason must contain 1 to 500 characters');
    }
  }

  private validateIdempotencyKey(value: string): void {
    if (value.length === 0 || value.length > 120) {
      throw new BadRequestException('Idempotency key must contain 1 to 120 characters');
    }
  }

  private nonNegativeDecimal(value: string, label: string): void {
    this.decimalInRange(value, label);
  }

  private decimalInRange(value: string, label: string, maximum?: Prisma.Decimal): Prisma.Decimal {
    try {
      const decimal = new Prisma.Decimal(value);
      if (decimal.isNegative() || (maximum !== undefined && decimal.greaterThan(maximum))) {
        throw new Error('negative');
      }
      return decimal;
    } catch {
      const range = maximum ? ` between 0 and ${maximum.toString()}` : ' a non-negative decimal';
      throw new BadRequestException(`${label} must be${range}`);
    }
  }
}
