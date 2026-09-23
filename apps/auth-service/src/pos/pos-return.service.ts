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
import { assertTrustedProviderAccess } from '../inventory/inventory-access';
import { PrismaService } from '../prisma/prisma.service';
import { formatPaise, parseMoneyToPaise } from './pos-money';
import { PosEventWriter } from './pos-event-writer';
import {
  PHARMACY_RETURN_REASONS,
  type PharmacySaleReturnReceipt,
  type ReturnPharmacySaleCommand,
} from './pos-return.types';

const SERIALIZABLE_ATTEMPTS = 10;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'OTHER'] as const;

interface ReturnLineCalculation {
  readonly saleLineId: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly subtotal: string;
  readonly discountAmount: string;
  readonly taxableValue: string;
  readonly cgstAmount: string;
  readonly sgstAmount: string;
  readonly igstAmount: string;
  readonly cessAmount: string;
  readonly refundTotal: string;
  readonly allocations: readonly {
    readonly saleAllocationId: string;
    readonly inventoryId: string;
    readonly productId: string;
    readonly batchId: string;
    readonly quantity: number;
    readonly batch: {
      readonly receivedQuantity: number;
      readonly onHandQuantity: number;
      readonly heldQuantity: number;
      readonly version: number;
      readonly status: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'QUARANTINED' | 'RECALLED';
      readonly deletedAt: Date | null;
    };
  }[];
}

@Injectable()
export class PosReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly events: PosEventWriter,
  ) {}

  async returnSale(
    command: ReturnPharmacySaleCommand,
    uniqueRetries = 2,
  ): Promise<PharmacySaleReturnReceipt> {
    this.validate(command);
    const commandHash = this.hash(command);

    try {
      return await withSerializableRetry(
        this.prisma.client,
        async (transaction) => {
          await assertTrustedProviderAccess(transaction, command.actor, command.providerId);

          const replay = await this.findReplay(
            transaction,
            command.actor.tenantId,
            command.providerId,
            command.idempotencyKey,
            commandHash,
          );
          if (replay) return replay;

          const now = await this.databaseNow(transaction);
          const requestedLineIds = command.lines.map(({ saleLineId }) => saleLineId);
          const sale = await transaction.pharmacySale.findFirst({
            where: {
              id: command.saleId,
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
            },
            select: {
              id: true,
              status: true,
              invoice: { select: { id: true } },
              lines: {
                where: { id: { in: requestedLineIds } },
                orderBy: { lineNumber: 'asc' },
                select: {
                  id: true,
                  inventoryId: true,
                  productId: true,
                  quantity: true,
                  grossValue: true,
                  discountAmount: true,
                  taxableValue: true,
                  cgstAmount: true,
                  sgstAmount: true,
                  igstAmount: true,
                  cessAmount: true,
                  lineTotal: true,
                  allocations: {
                    orderBy: { id: 'asc' },
                    select: {
                      id: true,
                      quantity: true,
                      inventoryId: true,
                      productId: true,
                      batchId: true,
                      batch: {
                        select: {
                          receivedQuantity: true,
                          onHandQuantity: true,
                          heldQuantity: true,
                          version: true,
                          status: true,
                          deletedAt: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });
          if (!sale?.invoice) throw new NotFoundException('POS sale not found');
          if (sale.status !== 'COMPLETED') {
            throw new ConflictException('Only a completed POS sale can be returned');
          }
          if (sale.lines.length !== command.lines.length) {
            throw new NotFoundException('One or more POS sale lines were not found');
          }

          const previousLines = await transaction.pharmacySaleReturnLine.groupBy({
            by: ['saleLineId'],
            where: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              saleId: command.saleId,
            },
            _sum: { quantity: true },
          });
          const previousLineQuantity = new Map(
            previousLines.map((row) => [row.saleLineId, row._sum.quantity ?? 0]),
          );

          const previousAllocations = await transaction.pharmacySaleReturnAllocation.groupBy({
            by: ['saleAllocationId'],
            where: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              saleId: command.saleId,
            },
            _sum: { quantity: true },
          });
          const previousAllocationQuantity = new Map(
            previousAllocations.map((row) => [row.saleAllocationId, row._sum.quantity ?? 0]),
          );

          const requestByLine = new Map(command.lines.map((line) => [line.saleLineId, line]));
          const calculations: ReturnLineCalculation[] = [];

          for (const line of sale.lines) {
            const requested = requestByLine.get(line.id);
            if (!requested) throw new NotFoundException('POS sale line not found');
            const alreadyReturned = previousLineQuantity.get(line.id) ?? 0;
            if (alreadyReturned + requested.quantity > line.quantity) {
              throw new ConflictException('Return quantity exceeds the remaining sold quantity');
            }

            let remaining = requested.quantity;
            const allocations: ReturnLineCalculation['allocations'][number][] = [];
            for (const allocation of line.allocations) {
              if (remaining === 0) break;
              const alreadyReturnedFromAllocation =
                previousAllocationQuantity.get(allocation.id) ?? 0;
              const allocationRemaining = allocation.quantity - alreadyReturnedFromAllocation;
              if (allocationRemaining <= 0) continue;
              const quantity = Math.min(remaining, allocationRemaining);
              if (allocation.batch.deletedAt !== null) {
                throw new ConflictException('Returned stock source batch was deleted');
              }
              if (allocation.batch.heldQuantity !== 0) {
                throw new ConflictException(
                  'Returned stock source batch has active reservation holds; resolve them first',
                );
              }
              if (allocation.batch.onHandQuantity + quantity > allocation.batch.receivedQuantity) {
                throw new ConflictException('Return would exceed source batch quantity integrity');
              }
              allocations.push({
                saleAllocationId: allocation.id,
                inventoryId: allocation.inventoryId,
                productId: allocation.productId,
                batchId: allocation.batchId,
                quantity,
                batch: allocation.batch,
              });
              remaining -= quantity;
            }
            if (remaining !== 0) {
              throw new ConflictException('Return allocation provenance is incomplete');
            }

            calculations.push({
              saleLineId: line.id,
              inventoryId: line.inventoryId,
              productId: line.productId,
              quantity: requested.quantity,
              subtotal: proportionalSlice(
                line.grossValue.toString(),
                line.quantity,
                alreadyReturned,
                requested.quantity,
              ),
              discountAmount: proportionalSlice(
                line.discountAmount.toString(),
                line.quantity,
                alreadyReturned,
                requested.quantity,
              ),
              taxableValue: proportionalSlice(
                line.taxableValue.toString(),
                line.quantity,
                alreadyReturned,
                requested.quantity,
              ),
              cgstAmount: proportionalSlice(
                line.cgstAmount.toString(),
                line.quantity,
                alreadyReturned,
                requested.quantity,
              ),
              sgstAmount: proportionalSlice(
                line.sgstAmount.toString(),
                line.quantity,
                alreadyReturned,
                requested.quantity,
              ),
              igstAmount: proportionalSlice(
                line.igstAmount.toString(),
                line.quantity,
                alreadyReturned,
                requested.quantity,
              ),
              cessAmount: proportionalSlice(
                line.cessAmount.toString(),
                line.quantity,
                alreadyReturned,
                requested.quantity,
              ),
              refundTotal: proportionalSlice(
                line.lineTotal.toString(),
                line.quantity,
                alreadyReturned,
                requested.quantity,
              ),
              allocations,
            });
          }

          const totals = {
            subtotal: sum(calculations.map((line) => line.subtotal)),
            discountTotal: sum(calculations.map((line) => line.discountAmount)),
            taxableTotal: sum(calculations.map((line) => line.taxableValue)),
            cgstTotal: sum(calculations.map((line) => line.cgstAmount)),
            sgstTotal: sum(calculations.map((line) => line.sgstAmount)),
            igstTotal: sum(calculations.map((line) => line.igstAmount)),
            cessTotal: sum(calculations.map((line) => line.cessAmount)),
            refundTotal: sum(calculations.map((line) => line.refundTotal)),
          };
          if (parseMoneyToPaise(totals.refundTotal) <= 0n) {
            throw new ConflictException('Return refund total must be positive');
          }

          const returnId = randomUUID();
          await transaction.pharmacySaleReturn.create({
            data: {
              id: returnId,
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              saleId: command.saleId,
              actorMembershipId: command.actor.membershipId,
              actorUserId: command.actor.userId,
              reasonCode: command.reasonCode,
              reason: command.reason,
              refundMethod: command.refundMethod,
              refundExternalReference: command.refundExternalReference,
              ...decimalTotals(totals),
              idempotencyKey: command.idempotencyKey,
              commandHash,
              occurredAt: now,
              createdAt: now,
            },
            select: { id: true },
          });

          for (const line of calculations) {
            const returnLineId = randomUUID();
            await transaction.pharmacySaleReturnLine.create({
              data: {
                id: returnLineId,
                tenantId: command.actor.tenantId,
                providerId: command.providerId,
                returnId,
                saleId: command.saleId,
                saleLineId: line.saleLineId,
                inventoryId: line.inventoryId,
                productId: line.productId,
                quantity: line.quantity,
                subtotal: new Prisma.Decimal(line.subtotal),
                discountAmount: new Prisma.Decimal(line.discountAmount),
                taxableValue: new Prisma.Decimal(line.taxableValue),
                cgstAmount: new Prisma.Decimal(line.cgstAmount),
                sgstAmount: new Prisma.Decimal(line.sgstAmount),
                igstAmount: new Prisma.Decimal(line.igstAmount),
                cessAmount: new Prisma.Decimal(line.cessAmount),
                refundTotal: new Prisma.Decimal(line.refundTotal),
                createdAt: now,
              },
              select: { id: true },
            });

            for (const allocation of line.allocations) {
              const nextStatus =
                allocation.batch.status === 'ACTIVE' || allocation.batch.status === 'EXHAUSTED'
                  ? 'QUARANTINED'
                  : allocation.batch.status;
              const onHandAfter = safeAdd(
                allocation.batch.onHandQuantity,
                allocation.quantity,
                'Return quantity exceeds database integer range',
              );
              const resultingBatchVersion = safeAdd(
                allocation.batch.version,
                1,
                'Batch version limit exceeded',
              );
              const updated = await transaction.batch.updateMany({
                where: {
                  id: allocation.batchId,
                  tenantId: command.actor.tenantId,
                  inventoryId: allocation.inventoryId,
                  providerId: command.providerId,
                  productId: allocation.productId,
                  receivedQuantity: allocation.batch.receivedQuantity,
                  onHandQuantity: allocation.batch.onHandQuantity,
                  heldQuantity: 0,
                  version: allocation.batch.version,
                  status: allocation.batch.status,
                  deletedAt: null,
                },
                data: {
                  onHandQuantity: onHandAfter,
                  status: nextStatus,
                  version: { increment: 1 },
                },
              });
              if (updated.count !== 1) {
                throw new SerializableRetryError('Concurrent return stock restoration detected');
              }

              const movementId = randomUUID();
              await transaction.stockMovement.create({
                data: {
                  id: movementId,
                  tenantId: command.actor.tenantId,
                  inventoryId: allocation.inventoryId,
                  batchId: allocation.batchId,
                  providerId: command.providerId,
                  productId: allocation.productId,
                  type: 'RETURN_IN',
                  delta: allocation.quantity,
                  onHandBefore: allocation.batch.onHandQuantity,
                  onHandAfter,
                  referenceType: 'pharmacy.sale.return',
                  referenceId: returnId,
                  reason: command.reason,
                  idempotencyKey: movementKey(command.idempotencyKey, allocation.saleAllocationId),
                  commandHash,
                  resultingBatchVersion,
                  actorType: 'TENANT_USER',
                  actorMembershipId: command.actor.membershipId,
                  occurredAt: now,
                },
                select: { id: true },
              });

              await transaction.pharmacySaleReturnAllocation.create({
                data: {
                  id: randomUUID(),
                  tenantId: command.actor.tenantId,
                  providerId: command.providerId,
                  returnId,
                  returnLineId,
                  saleId: command.saleId,
                  saleLineId: line.saleLineId,
                  saleAllocationId: allocation.saleAllocationId,
                  inventoryId: allocation.inventoryId,
                  productId: allocation.productId,
                  batchId: allocation.batchId,
                  stockMovementId: movementId,
                  quantity: allocation.quantity,
                  createdAt: now,
                },
                select: { id: true },
              });
            }
          }

          const totalQuantity = calculations.reduce((total, line) => total + line.quantity, 0);
          await this.audit.appendTenantUser(transaction, {
            tenantId: command.actor.tenantId,
            actorMembershipId: command.actor.membershipId,
            actorUserId: command.actor.userId,
            eventType: 'billing.pos.return.completed',
            outcome: 'SUCCEEDED',
            resourceType: 'PharmacySaleReturn',
            resourceId: returnId,
            occurredAt: now,
            metadata: {
              providerId: command.providerId,
              saleId: command.saleId,
              lineCount: calculations.length,
              totalQuantity,
              refundTotal: totals.refundTotal,
            },
            request: command.request,
          });
          await this.events.appendTenantUser(transaction, command.actor, {
            eventType: 'billing.pos.return.completed',
            aggregateType: 'PharmacySaleReturn',
            aggregateId: returnId,
            occurredAt: now,
            payload: {
              providerId: command.providerId,
              saleId: command.saleId,
              lineCount: calculations.length,
              totalQuantity,
              refundTotal: totals.refundTotal,
            },
          });

          return {
            returnId,
            saleId: command.saleId,
            providerId: command.providerId,
            reasonCode: command.reasonCode,
            refundMethod: command.refundMethod,
            refundExternalReference: command.refundExternalReference ?? null,
            lineCount: calculations.length,
            totalQuantity,
            ...totals,
            occurredAt: now,
            replayed: false,
          };
        },
        SERIALIZABLE_ATTEMPTS,
      );
    } catch (error) {
      if (!hasPrismaCode(error, 'P2002')) throw error;
      await assertTrustedProviderAccess(this.prisma.client, command.actor, command.providerId);
      const replay = await this.findReplay(
        this.prisma.client,
        command.actor.tenantId,
        command.providerId,
        command.idempotencyKey,
        commandHash,
      );
      if (replay) return replay;
      if (uniqueRetries > 0) return this.returnSale(command, uniqueRetries - 1);
      throw error;
    }
  }

  private async findReplay(
    database: Pick<Prisma.TransactionClient, 'pharmacySaleReturn'>,
    tenantId: string,
    providerId: string,
    idempotencyKey: string,
    expectedHash: string,
  ): Promise<PharmacySaleReturnReceipt | null> {
    const record = await database.pharmacySaleReturn.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: {
        id: true,
        providerId: true,
        saleId: true,
        reasonCode: true,
        refundMethod: true,
        refundExternalReference: true,
        subtotal: true,
        discountTotal: true,
        taxableTotal: true,
        cgstTotal: true,
        sgstTotal: true,
        igstTotal: true,
        cessTotal: true,
        refundTotal: true,
        commandHash: true,
        occurredAt: true,
        lines: { select: { quantity: true } },
      },
    });
    if (!record) return null;
    if (record.providerId !== providerId || record.commandHash !== expectedHash) {
      throw new ConflictException('Idempotency key is already used by another return command');
    }
    return {
      returnId: record.id,
      saleId: record.saleId,
      providerId: record.providerId,
      reasonCode: record.reasonCode,
      refundMethod: record.refundMethod,
      refundExternalReference: record.refundExternalReference,
      lineCount: record.lines.length,
      totalQuantity: record.lines.reduce((total, line) => total + line.quantity, 0),
      subtotal: record.subtotal.toFixed(2),
      discountTotal: record.discountTotal.toFixed(2),
      taxableTotal: record.taxableTotal.toFixed(2),
      cgstTotal: record.cgstTotal.toFixed(2),
      sgstTotal: record.sgstTotal.toFixed(2),
      igstTotal: record.igstTotal.toFixed(2),
      cessTotal: record.cessTotal.toFixed(2),
      refundTotal: record.refundTotal.toFixed(2),
      occurredAt: record.occurredAt,
      replayed: true,
    };
  }

  private validate(command: ReturnPharmacySaleCommand): void {
    if (
      command.idempotencyKey.length < 8 ||
      command.idempotencyKey.length > 120 ||
      command.idempotencyKey.trim() !== command.idempotencyKey
    ) {
      throw new BadRequestException('Idempotency key must contain 8 to 120 characters');
    }
    if (
      command.reason.length < 1 ||
      command.reason.length > 500 ||
      command.reason.trim() !== command.reason
    ) {
      throw new BadRequestException('Return reason must contain 1 to 500 trimmed characters');
    }
    if (!PHARMACY_RETURN_REASONS.includes(command.reasonCode)) {
      throw new BadRequestException('Unsupported pharmacy return reason');
    }
    if (!PAYMENT_METHODS.includes(command.refundMethod)) {
      throw new BadRequestException('Unsupported refund method');
    }
    if (
      command.refundExternalReference !== undefined &&
      (command.refundExternalReference.length < 1 ||
        command.refundExternalReference.length > 80 ||
        command.refundExternalReference.trim() !== command.refundExternalReference)
    ) {
      throw new BadRequestException('Refund reference must contain 1 to 80 trimmed characters');
    }
    if (command.lines.length < 1 || command.lines.length > 100) {
      throw new BadRequestException('Return must contain 1 to 100 lines');
    }
    const lineIds = new Set<string>();
    for (const line of command.lines) {
      if (lineIds.has(line.saleLineId)) throw new BadRequestException('Duplicate return sale line');
      lineIds.add(line.saleLineId);
      if (
        !Number.isSafeInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > MAX_DATABASE_INTEGER
      ) {
        throw new BadRequestException('Return quantity must be a positive database-safe integer');
      }
    }
  }

  private hash(command: ReturnPharmacySaleCommand): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: command.actor.tenantId,
          providerId: command.providerId,
          saleId: command.saleId,
          idempotencyKey: command.idempotencyKey,
          reasonCode: command.reasonCode,
          reason: command.reason,
          refundMethod: command.refundMethod,
          refundExternalReference: command.refundExternalReference ?? null,
          lines: [...command.lines]
            .map((line) => ({ saleLineId: line.saleLineId, quantity: line.quantity }))
            .sort((a, b) => a.saleLineId.localeCompare(b.saleLineId)),
        }),
      )
      .digest('hex');
  }

  private async databaseNow(database: Prisma.TransactionClient): Promise<Date> {
    const [{ occurredAt }] = await database.$queryRaw<Array<{ occurredAt: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP AS "occurredAt"`,
    );
    if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
      throw new Error('Database timestamp was not returned');
    }
    return occurredAt;
  }
}

function proportionalSlice(
  original: string,
  totalQuantity: number,
  previousQuantity: number,
  quantity: number,
): string {
  if (
    !Number.isSafeInteger(totalQuantity) ||
    totalQuantity < 1 ||
    !Number.isSafeInteger(previousQuantity) ||
    previousQuantity < 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    previousQuantity + quantity > totalQuantity
  ) {
    throw new ConflictException('Return monetary allocation quantity is invalid');
  }
  const total = parseMoneyToPaise(original);
  const denominator = BigInt(totalQuantity);
  const before = (total * BigInt(previousQuantity)) / denominator;
  const after = (total * BigInt(previousQuantity + quantity)) / denominator;
  return formatPaise(after - before);
}

function sum(values: readonly string[]): string {
  return formatPaise(values.reduce((total, value) => total + parseMoneyToPaise(value), 0n));
}

function decimalTotals(values: {
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  cessTotal: string;
  refundTotal: string;
}) {
  return {
    subtotal: new Prisma.Decimal(values.subtotal),
    discountTotal: new Prisma.Decimal(values.discountTotal),
    taxableTotal: new Prisma.Decimal(values.taxableTotal),
    cgstTotal: new Prisma.Decimal(values.cgstTotal),
    sgstTotal: new Prisma.Decimal(values.sgstTotal),
    igstTotal: new Prisma.Decimal(values.igstTotal),
    cessTotal: new Prisma.Decimal(values.cessTotal),
    refundTotal: new Prisma.Decimal(values.refundTotal),
  };
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
  if (result > MAX_DATABASE_INTEGER) throw new ConflictException(message);
  return result;
}

function movementKey(idempotencyKey: string, saleAllocationId: string): string {
  return `return:${createHash('sha256')
    .update(`${idempotencyKey}:${saleAllocationId}`)
    .digest('hex')}`;
}
