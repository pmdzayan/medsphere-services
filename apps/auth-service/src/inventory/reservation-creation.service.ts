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
import { InsufficientReservationStockError, planReservationFefo } from './reservation-fefo';
import type {
  CreateProviderReservationCommand,
  ProviderReservationCreationResult,
  ReservationCreationItem,
} from './reservation-creation.types';

const MAX_DATABASE_INTEGER = 2_147_483_647;
const MAX_ITEMS = 20;
const RESERVATION_SERIALIZABLE_ATTEMPTS = 10;

@Injectable()
export class ReservationCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly events: InventoryEventWriter,
  ) {}

  async create(
    command: CreateProviderReservationCommand,
  ): Promise<ProviderReservationCreationResult> {
    const items = this.normalize(command.items);
    const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);
    if (!Number.isSafeInteger(totalQuantity) || totalQuantity > MAX_DATABASE_INTEGER) {
      throw new BadRequestException('Total reservation quantity exceeds the supported limit');
    }
    if (Number.isNaN(command.expiresAt.getTime())) {
      throw new BadRequestException('Reservation expiry is invalid');
    }
    const commandHash = this.hash(command, items);

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
        if (command.expiresAt.getTime() <= occurredAt.getTime()) {
          throw new BadRequestException('Reservation expiry must be in the future');
        }

        const subject = await transaction.user.findFirst({
          where: {
            id: command.subjectUserId,
            status: 'ACTIVE',
            deletedAt: null,
            memberships: {
              some: {
                tenantId: command.actor.tenantId,
                status: 'ACTIVE',
                deletedAt: null,
                tenant: { isActive: true, deletedAt: null },
              },
            },
          },
          select: { id: true },
        });
        if (!subject) throw new NotFoundException('Reservation subject not found');

        const reservationId = randomUUID();
        const plans: Array<{
          item: ReservationCreationItem;
          itemId: string;
          allocations: Array<{
            batchId: string;
            inventoryId: string;
            quantity: number;
            onHandQuantity: number;
            heldQuantity: number;
            version: number;
          }>;
        }> = [];

        for (const item of items) {
          const batches = await transaction.batch.findMany({
            where: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              productId: item.productId,
              status: 'ACTIVE',
              expiryDate: { gt: occurredAt },
              deletedAt: null,
              inventory: { isVisible: true, deletedAt: null },
              product: { isActive: true, deletedAt: null },
            },
            select: {
              id: true,
              inventoryId: true,
              expiryDate: true,
              manufacturingDate: true,
              onHandQuantity: true,
              heldQuantity: true,
              version: true,
              createdAt: true,
            },
          });
          try {
            const byId = new Map(batches.map((batch) => [batch.id, batch]));
            const allocations = planReservationFefo(batches, item.quantity).map((allocation) => {
              const batch = byId.get(allocation.batchId);
              if (!batch) throw new Error('Reservation FEFO candidate invariant violated');
              return {
                ...allocation,
                onHandQuantity: batch.onHandQuantity,
                heldQuantity: batch.heldQuantity,
                version: batch.version,
              };
            });
            plans.push({ item, itemId: randomUUID(), allocations });
          } catch (error) {
            if (error instanceof InsufficientReservationStockError) {
              throw new ConflictException(
                `Insufficient eligible stock for product ${item.productId}`,
              );
            }
            throw error;
          }
        }

        await transaction.medicineReservation.create({
          data: {
            id: reservationId,
            tenantId: command.actor.tenantId,
            providerId: command.providerId,
            subjectUserId: command.subjectUserId,
            expiresAt: command.expiresAt,
            idempotencyKey: command.idempotencyKey,
            creationHash: commandHash,
          },
          select: { id: true },
        });

        for (const plan of plans) {
          await transaction.medicineReservationItem.create({
            data: {
              id: plan.itemId,
              tenantId: command.actor.tenantId,
              reservationId,
              providerId: command.providerId,
              productId: plan.item.productId,
              quantity: plan.item.quantity,
            },
            select: { id: true },
          });
          for (const allocation of plan.allocations) {
            const updated = await transaction.batch.updateMany({
              where: {
                id: allocation.batchId,
                tenantId: command.actor.tenantId,
                providerId: command.providerId,
                productId: plan.item.productId,
                status: 'ACTIVE',
                expiryDate: { gt: occurredAt },
                deletedAt: null,
                onHandQuantity: allocation.onHandQuantity,
                heldQuantity: allocation.heldQuantity,
                version: allocation.version,
              },
              data: {
                heldQuantity: { increment: allocation.quantity },
                version: { increment: 1 },
              },
            });
            if (updated.count !== 1) {
              throw new SerializableRetryError('Concurrent reservation stock allocation detected');
            }
            await transaction.medicineReservationAllocation.create({
              data: {
                id: randomUUID(),
                tenantId: command.actor.tenantId,
                reservationId,
                itemId: plan.itemId,
                inventoryId: allocation.inventoryId,
                batchId: allocation.batchId,
                providerId: command.providerId,
                productId: plan.item.productId,
                quantity: allocation.quantity,
              },
              select: { id: true },
            });
          }
        }

        await this.audit.appendTenantUser(transaction, {
          tenantId: command.actor.tenantId,
          actorMembershipId: command.actor.membershipId,
          eventType: 'inventory.reservation.created',
          outcome: 'SUCCEEDED',
          resourceType: 'MedicineReservation',
          resourceId: reservationId,
          occurredAt,
          metadata: {
            itemCount: items.length,
            totalQuantity,
            expiresAt: command.expiresAt.toISOString(),
          },
          request: command.request,
        });
        await this.events.appendTenantUser(transaction, command.actor, {
          eventType: 'inventory.reservation.created',
          aggregateType: 'MedicineReservation',
          aggregateId: reservationId,
          occurredAt,
          payload: {
            providerId: command.providerId,
            status: 'PENDING',
            version: 1,
            itemCount: items.length,
            totalQuantity,
            expiresAt: command.expiresAt.toISOString(),
          },
        });
        return {
          reservationId,
          status: 'PENDING',
          version: 1,
          itemCount: items.length,
          totalQuantity,
          replayed: false,
        };
      }, RESERVATION_SERIALIZABLE_ATTEMPTS);
    } catch (error) {
      if (hasPrismaCode(error, 'P2034')) {
        throw new ConflictException('Concurrent reservation stock allocation detected');
      }
      if (!hasPrismaCode(error, 'P2002')) throw error;
      return withSerializableRetry(this.prisma.client, async (transaction) => {
        await assertTrustedProviderAccess(transaction, command.actor, command.providerId);
        const replay = await this.findReplay(
          transaction,
          command.actor.tenantId,
          command.idempotencyKey,
          commandHash,
        );
        if (!replay) throw error;
        return replay;
      }, RESERVATION_SERIALIZABLE_ATTEMPTS);
    }
  }

  private normalize(items: readonly ReservationCreationItem[]): ReservationCreationItem[] {
    if (items.length === 0 || items.length > MAX_ITEMS) {
      throw new BadRequestException(`Reservation must contain 1 to ${MAX_ITEMS} products`);
    }
    const productIds = new Set<string>();
    const normalized = items.map((item) => {
      if (productIds.has(item.productId)) {
        throw new BadRequestException('Reservation product identifiers must be unique');
      }
      if (
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > MAX_DATABASE_INTEGER
      ) {
        throw new BadRequestException('Reservation quantities must be positive supported integers');
      }
      productIds.add(item.productId);
      return { productId: item.productId, quantity: item.quantity };
    });
    return normalized.sort((left, right) => left.productId.localeCompare(right.productId));
  }

  private async findReplay(
    database: Pick<Prisma.TransactionClient, 'medicineReservation'>,
    tenantId: string,
    idempotencyKey: string,
    commandHash: string,
  ): Promise<ProviderReservationCreationResult | null> {
    const reservation = await database.medicineReservation.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: {
        id: true,
        status: true,
        version: true,
        creationHash: true,
        items: { select: { quantity: true } },
      },
    });
    if (!reservation) return null;
    if (reservation.creationHash !== commandHash) {
      throw new ConflictException('Idempotency key is already used by another reservation');
    }
    return {
      reservationId: reservation.id,
      status: 'PENDING',
      version: 1,
      itemCount: reservation.items.length,
      totalQuantity: reservation.items.reduce((total, item) => total + item.quantity, 0),
      replayed: true,
    };
  }

  private hash(
    command: CreateProviderReservationCommand,
    items: readonly ReservationCreationItem[],
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: command.actor.tenantId,
          providerId: command.providerId,
          subjectUserId: command.subjectUserId,
          expiresAt: command.expiresAt.toISOString(),
          items,
        }),
      )
      .digest('hex');
  }
}
