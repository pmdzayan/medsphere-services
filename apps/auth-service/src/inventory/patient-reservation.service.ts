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
import { InventoryEventWriter } from './inventory-event-writer';
import { assertPersonalAccountContext } from './patient-context';
import { InsufficientReservationStockError, planReservationFefo } from './reservation-fefo';
import { releaseHeldAllocations } from './reservation-allocation-release';
import type { PatientReservationQueryDto } from './dto/patient-reservation-query.dto';
import type {
  CancelPatientReservationCommand,
  CreatePatientReservationCommand,
  PatientReservationCancellationResult,
  PatientReservationCreationResult,
  PatientReservationItemInput,
  PatientReservationPage,
  PatientReservationProjection,
} from './patient-reservation.types';
import type { AuthenticatedIdentity } from '../auth/auth.types';

const MAX_DATABASE_INTEGER = 2_147_483_647;
const MAX_ITEMS = 20;
/**
 * Task 0034 conservative V1 floor: a patient can reserve a bounded number of
 * units so one consumer cannot drain a provider's eligible stock in a single
 * request. Enforced server-side, never derived from the client.
 */
const MAX_TOTAL_QUANTITY = 100;
const DEFAULT_EXPIRY_HOURS = 24;
const MAX_EXPIRY_HOURS = 72;
const RESERVATION_SERIALIZABLE_ATTEMPTS = 10;
const HOUR_MS = 3_600_000;

const PUBLIC_PROVIDER_NOT_FOUND = 'Provider or product not found.';
const RESERVATION_NOT_FOUND = 'Medicine reservation not found';

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'READY'] as const;

/**
 * Task 0034 - Patient medicine reservation service.
 *
 * Ownership is derived EXCLUSIVELY from the authenticated global identity
 * (`identity.userId`). Every read/write is scoped by that server-derived id;
 * no client-supplied identifier can select another user's reservation.
 *
 * Reservation creation performs a fresh, authoritative eligible-stock check
 * inside a serializable transaction using the same FEFO allocator and batch
 * optimistic-concurrency guards as the accepted staff path, then creates the
 * shared MedicineReservation aggregate, appends audit, and enqueues the
 * accepted outbox event. Search results are never treated as a stock
 * guarantee.
 *
 * Audit uses AppendPlatformUser (scope PLATFORM, exact user id) and outbox
 * events use the SYSTEM actor bound to the provider tenant, because a patient
 * has no ACTIVE membership inside the provider's tenant. This mirrors the
 * established Task 0032 global-identity audit convention.
 */
@Injectable()
export class PatientReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly events: InventoryEventWriter,
  ) {}

  async create(
    command: CreatePatientReservationCommand,
  ): Promise<PatientReservationCreationResult> {
    const items = this.normalizeItems(command.items);
    const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);
    if (totalQuantity > MAX_TOTAL_QUANTITY) {
      throw new BadRequestException('Total reservation quantity exceeds the supported limit');
    }
    this.validateIdempotencyKey(command.idempotencyKey);
    await assertPersonalAccountContext(this.prisma.client, command.identity);

    const provider = await this.prisma.client.provider.findFirst({
      where: { id: command.providerId },
      select: { id: true, tenantId: true },
    });
    if (!provider) throw new NotFoundException(PUBLIC_PROVIDER_NOT_FOUND);
    const tenantId = provider.tenantId;

    const commandHash = this.creationHash(command, items, command.expiresAt ?? null);

    try {
      return await withSerializableRetry(
        this.prisma.client,
        async (transaction) => {
          const replay = await this.findCreationReplay(
            transaction,
            tenantId,
            command.idempotencyKey,
            commandHash,
            command.identity.userId,
          );
          if (replay) return replay;

          await this.assertListingExists(transaction, tenantId, command.providerId, items);
          const [{ occurredAt }] = await transaction.$queryRaw<Array<{ occurredAt: Date }>>(
            Prisma.sql`SELECT CURRENT_TIMESTAMP AS "occurredAt"`,
          );
          if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
            throw new Error('Database timestamp was not returned');
          }
          const expiresAt = this.resolveExpiry(command.expiresAt, occurredAt);

          const reservationId = randomUUID();
          const plans: Array<{
            item: PatientReservationItemInput;
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
                tenantId,
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
              tenantId,
              providerId: command.providerId,
              subjectUserId: command.identity.userId,
              expiresAt,
              idempotencyKey: command.idempotencyKey,
              creationHash: commandHash,
            },
            select: { id: true },
          });

          for (const plan of plans) {
            await transaction.medicineReservationItem.create({
              data: {
                id: plan.itemId,
                tenantId,
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
                  tenantId,
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
                throw new SerializableRetryError(
                  'Concurrent reservation stock allocation detected',
                );
              }
              await transaction.medicineReservationAllocation.create({
                data: {
                  id: randomUUID(),
                  tenantId,
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

          await this.audit.appendPlatformUser(transaction, {
            platformActorUserId: command.identity.userId,
            eventType: 'inventory.reservation.created',
            outcome: 'SUCCEEDED',
            resourceType: 'MedicineReservation',
            resourceId: reservationId,
            occurredAt,
            metadata: {
              itemCount: items.length,
              totalQuantity,
              expiresAt: expiresAt.toISOString(),
            },
            request: command.request,
          });
          await this.events.appendTenantSystem(transaction, tenantId, 'patient-reservations', {
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
              expiresAt: expiresAt.toISOString(),
            },
          });

          return {
            reservationId,
            status: 'PENDING',
            version: 1,
            itemCount: items.length,
            totalQuantity,
            expiresAt,
            replayed: false,
          };
        },
        RESERVATION_SERIALIZABLE_ATTEMPTS,
      );
    } catch (error) {
      if (hasPrismaCode(error, 'P2034')) {
        throw new ConflictException('Concurrent reservation stock allocation detected');
      }
      if (!hasPrismaCode(error, 'P2002')) throw error;
      return withSerializableRetry(
        this.prisma.client,
        async (transaction) => {
          const replay = await this.findCreationReplay(
            transaction,
            tenantId,
            command.idempotencyKey,
            commandHash,
            command.identity.userId,
          );
          if (!replay) throw error;
          return replay;
        },
        RESERVATION_SERIALIZABLE_ATTEMPTS,
      );
    }
  }

  async list(
    identity: AuthenticatedIdentity,
    query: PatientReservationQueryDto,
  ): Promise<PatientReservationPage> {
    await assertPersonalAccountContext(this.prisma.client, identity);
    const where = {
      subjectUserId: identity.userId,
      ...(query.status ? { status: query.status } : {}),
    } as const;
    const [rows, total] = await Promise.all([
      this.prisma.client.medicineReservation.findMany({
        where,
        select: PATIENT_RESERVATION_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.client.medicineReservation.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.mapProjection(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async get(
    identity: AuthenticatedIdentity,
    reservationId: string,
  ): Promise<PatientReservationProjection> {
    await assertPersonalAccountContext(this.prisma.client, identity);
    const row = await this.prisma.client.medicineReservation.findFirst({
      where: { id: reservationId, subjectUserId: identity.userId },
      select: PATIENT_RESERVATION_SELECT,
    });
    if (!row) throw new NotFoundException(RESERVATION_NOT_FOUND);
    return this.mapProjection(row);
  }

  async cancel(
    command: CancelPatientReservationCommand,
  ): Promise<PatientReservationCancellationResult> {
    this.validateIdempotencyKey(command.idempotencyKey);
    await assertPersonalAccountContext(this.prisma.client, command.identity);
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) {
      throw new BadRequestException('Expected version must be a positive safe integer');
    }
    const commandHash = this.cancellationHash(command);

    return withSerializableRetry(
      this.prisma.client,
      async (transaction) => {
        const reservation = await transaction.medicineReservation.findFirst({
          where: { id: command.reservationId, subjectUserId: command.identity.userId },
          select: {
            id: true,
            tenantId: true,
            providerId: true,
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
        if (!reservation) throw new NotFoundException(RESERVATION_NOT_FOUND);
        const tenantId = reservation.tenantId;

        const replay = await this.findCancellationReplay(
          transaction,
          tenantId,
          command.idempotencyKey,
          commandHash,
          command.reservationId,
        );
        if (replay) return replay;

        if (reservation.version !== command.expectedVersion) {
          throw new ConflictException('Medicine reservation version conflict');
        }
        if (
          !(ACTIVE_RESERVATION_STATUSES as readonly string[]).includes(reservation.status as string)
        ) {
          throw new ConflictException(`Cannot cancel reservation from ${reservation.status}`);
        }

        const [{ occurredAt }] = await transaction.$queryRaw<Array<{ occurredAt: Date }>>(
          Prisma.sql`SELECT CURRENT_TIMESTAMP AS "occurredAt"`,
        );
        if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
          throw new Error('Database timestamp was not returned');
        }
        if (reservation.expiresAt.getTime() <= occurredAt.getTime()) {
          throw new ConflictException('Expired medicine reservation awaits system expiry');
        }

        const requestedQuantity = reservation.items.reduce(
          (total, item) => total + item.quantity,
          0,
        );
        const heldQuantity = reservation.allocations.reduce(
          (total, allocation) => total + allocation.quantity,
          0,
        );
        if (heldQuantity !== requestedQuantity) {
          throw new ConflictException('Medicine reservation holds are incomplete');
        }

        await releaseHeldAllocations(
          transaction,
          { tenantId, providerId: reservation.providerId },
          reservation.allocations,
          occurredAt,
        );

        const resultingVersion = reservation.version + 1;
        const updated = await transaction.medicineReservation.updateMany({
          where: {
            id: reservation.id,
            tenantId,
            providerId: reservation.providerId,
            status: reservation.status,
            version: reservation.version,
          },
          data: {
            status: 'CANCELLED',
            version: { increment: 1 },
            cancelledAt: occurredAt,
          },
        });
        if (updated.count !== 1) {
          throw new SerializableRetryError('Concurrent reservation cancellation detected');
        }

        await transaction.medicineReservationCommand.create({
          data: {
            id: randomUUID(),
            tenantId,
            reservationId: reservation.id,
            providerId: reservation.providerId,
            commandType: 'CANCEL',
            idempotencyKey: command.idempotencyKey,
            commandHash,
            resultingStatus: 'CANCELLED',
            resultingVersion,
          },
          select: { id: true },
        });

        await this.audit.appendPlatformUser(transaction, {
          platformActorUserId: command.identity.userId,
          eventType: 'inventory.reservation.cancelled',
          outcome: 'SUCCEEDED',
          resourceType: 'MedicineReservation',
          resourceId: reservation.id,
          occurredAt,
          metadata: {
            previousStatus: reservation.status,
            version: resultingVersion,
            totalQuantity: requestedQuantity,
          },
          request: command.request,
        });
        await this.events.appendTenantSystem(transaction, tenantId, 'patient-reservations', {
          eventType: 'inventory.reservation.cancelled',
          aggregateType: 'MedicineReservation',
          aggregateId: reservation.id,
          occurredAt,
          payload: {
            providerId: reservation.providerId,
            previousStatus: reservation.status,
            status: 'CANCELLED',
            version: resultingVersion,
            totalQuantity: requestedQuantity,
            cause: 'PATIENT_REQUESTED',
          },
        });

        return {
          reservationId: reservation.id,
          status: 'CANCELLED',
          version: resultingVersion,
          totalQuantity: requestedQuantity,
          replayed: false,
        };
      },
      RESERVATION_SERIALIZABLE_ATTEMPTS,
    );
  }

  private normalizeItems(
    items: readonly PatientReservationItemInput[],
  ): PatientReservationItemInput[] {
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

  private validateIdempotencyKey(value: string): void {
    if (value.length === 0 || value.length > 120 || value !== value.trim()) {
      throw new BadRequestException('Idempotency key must contain 1 to 120 trimmed characters');
    }
  }

  private async assertListingExists(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    providerId: string,
    items: readonly PatientReservationItemInput[],
  ): Promise<void> {
    const count = await transaction.inventory.count({
      where: {
        tenantId,
        providerId,
        productId: { in: items.map((item) => item.productId) },
        isVisible: true,
        deletedAt: null,
        provider: { id: providerId, isActive: true, isVerified: true, deletedAt: null },
        product: { isActive: true, deletedAt: null },
      },
    });
    if (count !== items.length) {
      throw new NotFoundException(PUBLIC_PROVIDER_NOT_FOUND);
    }
  }

  private resolveExpiry(requested: Date | undefined, now: Date): Date {
    if (requested === undefined) {
      return new Date(now.getTime() + DEFAULT_EXPIRY_HOURS * HOUR_MS);
    }
    if (Number.isNaN(requested.getTime())) {
      throw new BadRequestException('Reservation expiry is invalid');
    }
    if (requested.getTime() <= now.getTime()) {
      throw new BadRequestException('Reservation expiry must be in the future');
    }
    const maximum = now.getTime() + MAX_EXPIRY_HOURS * HOUR_MS;
    if (requested.getTime() > maximum) {
      throw new BadRequestException('Reservation expiry is too far in the future');
    }
    return requested;
  }
  private async findCreationReplay(
    transaction: Pick<Prisma.TransactionClient, 'medicineReservation'>,
    tenantId: string,
    idempotencyKey: string,
    commandHash: string,
    subjectUserId: string,
  ): Promise<PatientReservationCreationResult | null> {
    const reservation = await transaction.medicineReservation.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: {
        id: true,
        subjectUserId: true,
        creationHash: true,
        expiresAt: true,
        items: { select: { quantity: true } },
      },
    });
    if (!reservation) return null;
    // A reservation under the same (tenant, key) that belongs to another
    // patient is indistinguishable from a missing reservation: the caller
    // must never learn that another patient's reservation exists.
    if (reservation.subjectUserId !== subjectUserId) {
      throw new NotFoundException(RESERVATION_NOT_FOUND);
    }
    if (reservation.creationHash !== commandHash) {
      throw new ConflictException('Idempotency key is already used by another reservation');
    }
    const totalQuantity = reservation.items.reduce((total, item) => total + item.quantity, 0);
    return {
      reservationId: reservation.id,
      status: 'PENDING',
      version: 1,
      itemCount: reservation.items.length,
      totalQuantity,
      expiresAt: reservation.expiresAt,
      replayed: true,
    };
  }

  private async findCancellationReplay(
    transaction: Pick<Prisma.TransactionClient, 'medicineReservationCommand'>,
    tenantId: string,
    idempotencyKey: string,
    commandHash: string,
    reservationId: string,
  ): Promise<PatientReservationCancellationResult | null> {
    const receipt = await transaction.medicineReservationCommand.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: {
        reservationId: true,
        commandType: true,
        commandHash: true,
        resultingStatus: true,
        resultingVersion: true,
        reservation: { select: { items: { select: { quantity: true } } } },
      },
    });
    if (!receipt) return null;
    if (
      receipt.commandType !== 'CANCEL' ||
      receipt.reservationId !== reservationId ||
      receipt.commandHash !== commandHash
    ) {
      throw new ConflictException('Idempotency key is already used by another transition');
    }
    const totalQuantity = receipt.reservation.items.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    return {
      reservationId: receipt.reservationId,
      status: 'CANCELLED',
      version: receipt.resultingVersion,
      totalQuantity,
      replayed: true,
    };
  }
  private creationHash(
    command: CreatePatientReservationCommand,
    items: readonly PatientReservationItemInput[],
    requestedExpiry: Date | null,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          subjectUserId: command.identity.userId,
          providerId: command.providerId,
          requestedExpiresAt: requestedExpiry?.toISOString() ?? null,
          items,
        }),
      )
      .digest('hex');
  }

  private cancellationHash(command: CancelPatientReservationCommand): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          subjectUserId: command.identity.userId,
          reservationId: command.reservationId,
          expectedVersion: command.expectedVersion,
        }),
      )
      .digest('hex');
  }

  private mapProjection(row: PatientReservationSourceRow): PatientReservationProjection {
    return {
      id: row.id,
      status: row.status,
      version: row.version,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      cancelledAt: row.cancelledAt,
      expiredAt: row.expiredAt,
      providerId: row.providerId,
      providerName: row.provider.businessName,
      providerCity: row.provider.city,
      providerState: row.provider.state,
      items: row.items.map((item) => ({
        productId: item.productId,
        name: item.product.name,
        genericName: item.product.genericName,
        brand: item.product.brand,
        strength: item.product.strength,
        dosageForm: item.product.dosageForm,
        quantity: item.quantity,
      })),
      totalQuantity: row.items.reduce((total, item) => total + item.quantity, 0),
    };
  }
}
const PATIENT_RESERVATION_SELECT = {
  id: true,
  status: true,
  version: true,
  expiresAt: true,
  createdAt: true,
  cancelledAt: true,
  expiredAt: true,
  providerId: true,
  provider: { select: { businessName: true, city: true, state: true } },
  items: {
    select: {
      productId: true,
      quantity: true,
      product: {
        select: {
          name: true,
          genericName: true,
          brand: true,
          strength: true,
          dosageForm: true,
        },
      },
    },
    orderBy: { id: 'asc' as const },
  },
} as const;

type PatientReservationSourceRow = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  version: number;
  expiresAt: Date;
  createdAt: Date;
  cancelledAt: Date | null;
  expiredAt: Date | null;
  providerId: string;
  provider: { businessName: string; city: string; state: string };
  items: Array<{
    productId: string;
    quantity: number;
    product: {
      name: string;
      genericName: string | null;
      brand: string;
      strength: string;
      dosageForm: string;
    };
  }>;
};
