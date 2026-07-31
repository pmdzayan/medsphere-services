import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditWriter,
  Prisma,
  SerializableRetryError,
  hasPrismaCode,
  withSerializableRetry,
} from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';
import { InsufficientFefoStockError, planFefoAllocation } from '../stock/fefo';
import { assertActiveTenantActor } from '../stock/tenant-actor';
import type {
  CreateMedicineReservationCommand,
  MedicineReservationItemInput,
  MedicineReservationResult,
} from './medicine-reservation.types';

@Injectable()
export class MedicineReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async create(command: CreateMedicineReservationCommand): Promise<MedicineReservationResult> {
    const items = this.validateAndNormalize(command);
    const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);
    const creationHash = this.creationHash(command, items);

    try {
      return await withSerializableRetry(this.prisma.client, async (transaction) => {
        const replay = await this.findReplay(
          transaction,
          command.actor.tenantId,
          command.idempotencyKey,
          creationHash,
        );
        if (replay) return replay;

        await assertActiveTenantActor(transaction, command.actor);
        const [provider, subject] = await Promise.all([
          transaction.provider.findFirst({
            where: {
              id: command.providerId,
              tenantId: command.actor.tenantId,
              isActive: true,
              deletedAt: null,
            },
            select: { id: true },
          }),
          transaction.user.findFirst({
            where: {
              id: command.subjectUserId,
              status: 'ACTIVE',
              deletedAt: null,
              memberships: {
                some: {
                  tenantId: command.actor.tenantId,
                  status: 'ACTIVE',
                  deletedAt: null,
                },
              },
            },
            select: { id: true },
          }),
        ]);
        if (!provider || !subject) {
          throw new NotFoundException('Active provider or reservation subject not found in tenant');
        }

        const reservationId = randomUUID();
        const itemPlans: Array<{
          item: MedicineReservationItemInput;
          itemId: string;
          allocations: Array<{
            batchId: string;
            inventoryId: string;
            quantity: number;
            previousHeld: number;
            onHand: number;
            version: number;
          }>;
        }> = [];
        const asOf = new Date();

        for (const item of items) {
          const batches = await transaction.batch.findMany({
            where: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              productId: item.productId,
              status: 'ACTIVE',
              expiryDate: { gt: asOf },
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
              status: true,
              createdAt: true,
              deletedAt: true,
            },
          });
          try {
            const candidatesById = new Map(batches.map((batch) => [batch.id, batch]));
            const allocations = planFefoAllocation(batches, item.quantity, asOf).map(
              (allocation) => {
                const batch = candidatesById.get(allocation.batchId);
                if (!batch) throw new Error('FEFO candidate invariant violated');
                return {
                  ...allocation,
                  previousHeld: batch.heldQuantity,
                  onHand: batch.onHandQuantity,
                  version: batch.version,
                };
              },
            );
            itemPlans.push({
              item,
              itemId: randomUUID(),
              allocations,
            });
          } catch (error) {
            if (error instanceof InsufficientFefoStockError) {
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
            notes: command.notes,
            idempotencyKey: command.idempotencyKey,
            creationHash,
          },
          select: { id: true },
        });

        for (const plan of itemPlans) {
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
            const held = await transaction.batch.updateMany({
              where: {
                id: allocation.batchId,
                tenantId: command.actor.tenantId,
                providerId: command.providerId,
                productId: plan.item.productId,
                status: 'ACTIVE',
                expiryDate: { gt: asOf },
                deletedAt: null,
                onHandQuantity: allocation.onHand,
                heldQuantity: allocation.previousHeld,
                version: allocation.version,
              },
              data: { heldQuantity: { increment: allocation.quantity }, version: { increment: 1 } },
            });
            if (held.count !== 1) {
              throw new SerializableRetryError('Concurrent medicine stock allocation detected');
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
          metadata: {
            itemCount: items.length,
            totalQuantity,
            expiresAt: command.expiresAt.toISOString(),
          },
          request: command.request,
        });
        return {
          reservationId,
          status: 'PENDING',
          version: 1,
          itemCount: items.length,
          totalQuantity,
          replayed: false,
        };
      });
    } catch (error) {
      if (!hasPrismaCode(error, 'P2002')) throw error;
      const replay = await this.findReplay(
        this.prisma.client,
        command.actor.tenantId,
        command.idempotencyKey,
        creationHash,
      );
      if (!replay) throw error;
      return replay;
    }
  }

  private async findReplay(
    database: Pick<Prisma.TransactionClient, 'medicineReservation'>,
    tenantId: string,
    idempotencyKey: string,
    creationHash: string,
  ): Promise<MedicineReservationResult | null> {
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
    if (reservation.creationHash !== creationHash) {
      throw new ConflictException('Idempotency key is already used by another reservation');
    }
    if (reservation.status !== 'PENDING') {
      throw new ConflictException('Reservation has advanced beyond its creation result');
    }
    return {
      reservationId: reservation.id,
      status: 'PENDING',
      version: reservation.version,
      itemCount: reservation.items.length,
      totalQuantity: reservation.items.reduce((total, item) => total + item.quantity, 0),
      replayed: true,
    };
  }

  private validateAndNormalize(
    command: CreateMedicineReservationCommand,
  ): MedicineReservationItemInput[] {
    if (command.idempotencyKey.length === 0 || command.idempotencyKey.length > 120) {
      throw new BadRequestException('Idempotency key must contain 1 to 120 characters');
    }
    if (Number.isNaN(command.expiresAt.getTime()) || command.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Reservation expiry must be in the future');
    }
    if (command.notes !== undefined && command.notes.length > 500) {
      throw new BadRequestException('Reservation notes cannot exceed 500 characters');
    }
    if (command.items.length === 0 || command.items.length > 100) {
      throw new BadRequestException('Reservation must contain 1 to 100 products');
    }
    const productIds = new Set<string>();
    const normalized = command.items.map((item) => {
      if (item.productId.length === 0 || productIds.has(item.productId)) {
        throw new BadRequestException('Reservation product identifiers must be unique');
      }
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException('Reservation quantities must be positive safe integers');
      }
      productIds.add(item.productId);
      return { productId: item.productId, quantity: item.quantity };
    });
    normalized.sort((left, right) => left.productId.localeCompare(right.productId));
    return normalized;
  }

  private creationHash(
    command: CreateMedicineReservationCommand,
    items: readonly MedicineReservationItemInput[],
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: command.actor.tenantId,
          providerId: command.providerId,
          subjectUserId: command.subjectUserId,
          expiresAt: command.expiresAt.toISOString(),
          notes: command.notes ?? null,
          items,
        }),
      )
      .digest('hex');
  }
}
