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
  isSerializableConflict,
  withSerializableRetry,
} from '@medsphere/database';
import { AuditWriter } from '../audit/audit-writer.service';
import { assertTrustedProviderAccess } from '../inventory/inventory-access';
import { InventoryEventWriter } from '../inventory/inventory-event-writer';
import { PickupHandoffService } from '../inventory/pickup-handoff.service';
import {
  InsufficientReservationStockError,
  planReservationFefo,
} from '../inventory/reservation-fefo';
import { writeReservationTimelineEvent } from '../patient-timeline/reservation-timeline-writer';
import { PharmacyVerificationEligibilityEvaluator } from '../pharmacy-verification/pharmacy-verification-eligibility.evaluator';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculatePosLineMoney,
  compareMoney,
  parseMoneyToPaise,
  subtractMoney,
  sumMoney,
} from './pos-money';
import { PosEventWriter } from './pos-event-writer';
import { indianFinancialYear } from './pos-financial-year';
import type {
  PharmacyCheckoutCommand,
  PosActor,
  ReprintPharmacyInvoiceCommand,
  VoidPharmacySaleCommand,
} from './pos.types';

const MAX_LINES = 100;
const MAX_PAYMENTS = 4;
const SERIALIZABLE_ATTEMPTS = 10;
const STATE_CODE_PATTERN = /^\d{2}$/;
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

type Transaction = Prisma.TransactionClient;
interface NormalizedLine {
  readonly productId: string;
  readonly quantity: number;
}

interface NormalizedPayment {
  readonly method: 'CASH' | 'CARD' | 'UPI' | 'OTHER';
  readonly amount: string;
  readonly externalReference?: string;
}

interface InventoryForSale {
  readonly id: string;
  readonly productId: string;
  readonly isVisible: boolean;
  readonly sellingPrice: Prisma.Decimal;
  readonly mrp: Prisma.Decimal;
  readonly discountPercentage: Prisma.Decimal;
  readonly taxPercentage: Prisma.Decimal;
  readonly product: {
    readonly name: string;
    readonly brand: string;
    readonly strength: string;
    readonly dosageForm: string;
    readonly requiresPrescription: boolean;
  };
  readonly fiscalProfile: {
    readonly hsnCode: string;
    readonly uqc: string;
    readonly cessPercentage: Prisma.Decimal;
  } | null;
  readonly batches: readonly {
    readonly id: string;
    readonly inventoryId: string;
    readonly expiryDate: Date;
    readonly manufacturingDate: Date | null;
    readonly onHandQuantity: number;
    readonly heldQuantity: number;
    readonly version: number;
    readonly createdAt: Date;
  }[];
}

interface PreparedLine {
  readonly id: string;
  readonly lineNumber: number;
  readonly quantity: number;
  readonly inventory: InventoryForSale;
  readonly money: ReturnType<typeof calculatePosLineMoney>;
}

@Injectable()
export class PosCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly events: PosEventWriter,
    private readonly inventoryEvents: InventoryEventWriter,
    private readonly pickupHandoff: PickupHandoffService,
    private readonly pharmacyEligibility: PharmacyVerificationEligibilityEvaluator,
  ) {}

  async checkout(command: PharmacyCheckoutCommand) {
    const normalized = this.normalizeCheckout(command);
    const commandHash = this.checkoutHash(command, normalized.lines, normalized.payments);

    try {
      return await withSerializableRetry(
        this.prisma.client,
        async (transaction) => {
          await assertTrustedProviderAccess(transaction, command.actor, command.providerId);

          const replay = await this.findCheckoutReplay(
            transaction,
            command.actor.tenantId,
            command.idempotencyKey,
            commandHash,
          );
          if (replay) {
            return this.loadReceipt(
              transaction,
              command.actor.tenantId,
              command.providerId,
              replay.saleId,
              true,
            );
          }

          const now = await this.databaseNow(transaction);
          const eligibility = await this.pharmacyEligibility.evaluateWithDatabase(transaction, {
            tenantId: command.actor.tenantId,
            providerId: command.providerId,
            now,
          });
          if (!eligibility.eligible) {
            throw new ConflictException('Pharmacy is not currently eligible for POS checkout');
          }

          const provider = await transaction.provider.findFirst({
            where: {
              id: command.providerId,
              tenantId: command.actor.tenantId,
              providerType: 'PHARMACY',
              isActive: true,
              deletedAt: null,
            },
            select: { id: true, address: true },
          });
          if (!provider) throw new NotFoundException('Assigned pharmacy provider not found');
          if (provider.address.trim().length === 0 || provider.address.length > 500) {
            throw new ConflictException('Pharmacy address is not ready for fiscal invoicing');
          }

          const fiscal = await transaction.pharmacyFiscalProfile.findFirst({
            where: {
              providerId: command.providerId,
              tenantId: command.actor.tenantId,
            },
            select: {
              registrationType: true,
              legalName: true,
              gstin: true,
              stateCode: true,
              invoiceSeries: true,
              pricesIncludeTax: true,
            },
          });
          if (!fiscal) {
            throw new ConflictException('Pharmacy fiscal profile is required before checkout');
          }

          const inventories = await transaction.inventory.findMany({
            where: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              productId: { in: normalized.lines.map((line) => line.productId) },
              deletedAt: null,
              product: { isActive: true, deletedAt: null },
            },
            select: {
              id: true,
              productId: true,
              isVisible: true,
              sellingPrice: true,
              mrp: true,
              discountPercentage: true,
              taxPercentage: true,
              product: {
                select: {
                  name: true,
                  brand: true,
                  strength: true,
                  dosageForm: true,
                  requiresPrescription: true,
                },
              },
              fiscalProfile: {
                select: { hsnCode: true, uqc: true, cessPercentage: true },
              },
              batches: {
                where: {
                  status: 'ACTIVE',
                  expiryDate: { gt: now },
                  deletedAt: null,
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
              },
            },
          });

          const inventoryByProduct = new Map<string, InventoryForSale>(
            inventories.map((inventory) => [inventory.productId, inventory as InventoryForSale]),
          );
          if (inventoryByProduct.size !== normalized.lines.length) {
            throw new NotFoundException(
              'One or more POS products are not assigned to this pharmacy',
            );
          }

          const collectGst = fiscal.registrationType === 'GST_REGULAR';
          const intraState = fiscal.stateCode === normalized.placeOfSupplyStateCode;
          const preparedLines: PreparedLine[] = normalized.lines.map((line, index) => {
            const inventory = inventoryByProduct.get(line.productId);
            if (!inventory) throw new NotFoundException('POS product not found');
            if (!command.reservationId && !inventory.isVisible) {
              throw new ConflictException(
                'A hidden inventory listing cannot be sold as a walk-in item',
              );
            }
            if (inventory.product.requiresPrescription) {
              throw new ConflictException(
                'Prescription-required products require the clinical dispensing workflow',
              );
            }
            if (!inventory.fiscalProfile) {
              throw new ConflictException('Inventory fiscal profile is required before checkout');
            }
            this.validateProductSnapshot(inventory);

            try {
              return {
                id: randomUUID(),
                lineNumber: index + 1,
                quantity: line.quantity,
                inventory,
                money: calculatePosLineMoney({
                  unitPrice: String(inventory.sellingPrice),
                  quantity: line.quantity,
                  discountPercentage: String(inventory.discountPercentage),
                  gstPercentage: String(inventory.taxPercentage),
                  cessPercentage: String(inventory.fiscalProfile.cessPercentage),
                  pricesIncludeTax: fiscal.pricesIncludeTax,
                  collectGst,
                  intraState,
                }),
              };
            } catch {
              throw new ConflictException('Configured POS pricing or tax values are invalid');
            }
          });

          const totals = {
            subtotal: sumMoney(preparedLines.map((line) => line.money.grossValue)),
            discountTotal: sumMoney(preparedLines.map((line) => line.money.discountAmount)),
            taxableTotal: sumMoney(preparedLines.map((line) => line.money.taxableValue)),
            cgstTotal: sumMoney(preparedLines.map((line) => line.money.cgstAmount)),
            sgstTotal: sumMoney(preparedLines.map((line) => line.money.sgstAmount)),
            igstTotal: sumMoney(preparedLines.map((line) => line.money.igstAmount)),
            cessTotal: sumMoney(preparedLines.map((line) => line.money.cessAmount)),
            grandTotal: sumMoney(preparedLines.map((line) => line.money.lineTotal)),
          };
          if (parseMoneyToPaise(totals.grandTotal) <= 0n) {
            throw new BadRequestException('POS checkout total must be greater than zero');
          }

          const paymentTotal = sumMoney(normalized.payments.map((payment) => payment.amount));
          if (compareMoney(paymentTotal, totals.grandTotal) !== 0) {
            throw new BadRequestException('POS payments must exactly equal the checkout total');
          }

          const cashAmount = sumMoney(
            normalized.payments
              .filter((payment) => payment.method === 'CASH')
              .map((payment) => payment.amount),
          );
          let cashTendered: string | null = null;
          let changeDue: string | null = null;
          if (command.cashTendered !== undefined) {
            cashTendered = this.normalizeMoney(command.cashTendered, 'Cash tendered');
            if (compareMoney(cashAmount, '0.00') === 0) {
              throw new BadRequestException('Cash tendered requires a CASH payment');
            }
            if (compareMoney(cashTendered, cashAmount) < 0) {
              throw new BadRequestException('Cash tendered is less than the CASH payment amount');
            }
            changeDue = subtractMoney(cashTendered, cashAmount);
          }

          const reservation = command.reservationId
            ? await this.loadReadyReservation(transaction, command, normalized.lines, now)
            : null;
          const pickupAuthority = reservation
            ? await this.pickupHandoff.verifyForCheckout(transaction, {
                tenantId: command.actor.tenantId,
                providerId: command.providerId,
                reservationId: reservation.id,
                subjectUserId: reservation.subjectUserId,
                pickupToken: command.pickupToken!,
                occurredAt: now,
              })
            : null;

          const saleId = randomUUID();
          const financialYear = indianFinancialYear(now);
          const invoiceNumber = await this.allocateInvoiceNumber(
            transaction,
            command.actor.tenantId,
            command.providerId,
            financialYear,
            fiscal.invoiceSeries,
          );
          const documentType =
            fiscal.registrationType === 'GST_REGULAR'
              ? 'TAX_INVOICE'
              : fiscal.registrationType === 'GST_COMPOSITION'
                ? 'BILL_OF_SUPPLY'
                : 'COMMERCIAL_RECEIPT';

          await transaction.pharmacySale.create({
            data: {
              id: saleId,
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              actorMembershipId: command.actor.membershipId,
              actorUserId: command.actor.userId,
              reservationId: command.reservationId,
              pricesIncludeTax: fiscal.pricesIncludeTax,
              subtotal: totals.subtotal,
              discountTotal: totals.discountTotal,
              taxableTotal: totals.taxableTotal,
              cgstTotal: totals.cgstTotal,
              sgstTotal: totals.sgstTotal,
              igstTotal: totals.igstTotal,
              cessTotal: totals.cessTotal,
              grandTotal: totals.grandTotal,
              cashTendered,
              changeDue,
              placeOfSupplyStateCode: normalized.placeOfSupplyStateCode,
              recipientName: normalized.recipientName,
              recipientAddress: normalized.recipientAddress,
              recipientGstin: normalized.recipientGstin,
              idempotencyKey: command.idempotencyKey,
              commandHash,
              completedAt: now,
            },
            select: { id: true },
          });

          for (const line of preparedLines) {
            await transaction.pharmacySaleLine.create({
              data: {
                id: line.id,
                tenantId: command.actor.tenantId,
                saleId,
                providerId: command.providerId,
                inventoryId: line.inventory.id,
                productId: line.inventory.productId,
                lineNumber: line.lineNumber,
                quantity: line.quantity,
                productNameSnapshot: line.inventory.product.name,
                brandSnapshot: line.inventory.product.brand,
                strengthSnapshot: line.inventory.product.strength,
                dosageFormSnapshot: line.inventory.product.dosageForm,
                hsnCodeSnapshot: line.inventory.fiscalProfile!.hsnCode,
                uqcSnapshot: line.inventory.fiscalProfile!.uqc,
                unitPrice: line.money.unitPrice,
                mrp: String(line.inventory.mrp),
                grossValue: line.money.grossValue,
                discountPercentage: String(line.inventory.discountPercentage),
                discountAmount: line.money.discountAmount,
                taxableValue: line.money.taxableValue,
                gstPercentage: String(line.inventory.taxPercentage),
                cessPercentage: String(line.inventory.fiscalProfile!.cessPercentage),
                cgstAmount: line.money.cgstAmount,
                sgstAmount: line.money.sgstAmount,
                igstAmount: line.money.igstAmount,
                cessAmount: line.money.cessAmount,
                lineTotal: line.money.lineTotal,
              },
              select: { id: true },
            });
          }

          if (reservation) {
            await this.commitReservationStock(
              transaction,
              command,
              reservation,
              preparedLines,
              saleId,
              commandHash,
              now,
            );
            await this.pickupHandoff.recordCompletedHandoff(transaction, {
              actor: command.actor,
              providerId: command.providerId,
              reservationId: reservation.id,
              subjectUserId: reservation.subjectUserId,
              saleId,
              authority: pickupAuthority!,
              occurredAt: now,
              request: command.request,
            });
          } else {
            await this.commitWalkInStock(
              transaction,
              command,
              preparedLines,
              saleId,
              commandHash,
              now,
            );
          }

          for (const payment of normalized.payments) {
            await transaction.pharmacySalePayment.create({
              data: {
                tenantId: command.actor.tenantId,
                providerId: command.providerId,
                saleId,
                method: payment.method,
                amount: payment.amount,
                externalReference: payment.externalReference,
              },
              select: { id: true },
            });
          }

          await transaction.pharmacyInvoice.create({
            data: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              saleId,
              documentType,
              financialYear,
              invoiceNumber,
              issuedAt: now,
              supplierLegalName: fiscal.legalName,
              supplierAddress: provider.address,
              supplierGstin: fiscal.gstin,
              supplierStateCode: fiscal.stateCode,
              placeOfSupplyStateCode: normalized.placeOfSupplyStateCode,
              recipientName: normalized.recipientName,
              recipientAddress: normalized.recipientAddress,
              recipientGstin: normalized.recipientGstin,
              subtotal: totals.subtotal,
              discountTotal: totals.discountTotal,
              taxableTotal: totals.taxableTotal,
              cgstTotal: totals.cgstTotal,
              sgstTotal: totals.sgstTotal,
              igstTotal: totals.igstTotal,
              cessTotal: totals.cessTotal,
              grandTotal: totals.grandTotal,
            },
            select: { id: true },
          });

          await transaction.pharmacySaleCommand.create({
            data: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              saleId,
              commandType: 'CHECKOUT',
              idempotencyKey: command.idempotencyKey,
              commandHash,
            },
            select: { id: true },
          });

          const totalQuantity = normalized.lines.reduce((total, line) => total + line.quantity, 0);
          await this.audit.appendTenantUser(transaction, {
            tenantId: command.actor.tenantId,
            actorMembershipId: command.actor.membershipId,
            actorUserId: command.actor.userId,
            eventType: 'billing.pos.sale.completed',
            outcome: 'SUCCEEDED',
            resourceType: 'PharmacySale',
            resourceId: saleId,
            occurredAt: now,
            metadata: {
              providerId: command.providerId,
              lineCount: normalized.lines.length,
              totalQuantity,
              grandTotal: totals.grandTotal,
              invoiceNumber,
              reservationId: command.reservationId ?? null,
            },
            request: command.request,
          });
          await this.events.appendTenantUser(transaction, command.actor, {
            eventType: 'billing.pos.sale.completed',
            aggregateType: 'PharmacySale',
            aggregateId: saleId,
            occurredAt: now,
            payload: {
              providerId: command.providerId,
              lineCount: normalized.lines.length,
              totalQuantity,
              grandTotal: totals.grandTotal,
              invoiceNumber,
              reservationId: command.reservationId ?? null,
            },
          });

          return this.loadReceipt(
            transaction,
            command.actor.tenantId,
            command.providerId,
            saleId,
            false,
          );
        },
        SERIALIZABLE_ATTEMPTS,
      );
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        await assertTrustedProviderAccess(this.prisma.client, command.actor, command.providerId);
        const replay = await this.findCheckoutReplay(
          this.prisma.client as unknown as Transaction,
          command.actor.tenantId,
          command.idempotencyKey,
          commandHash,
        );
        if (replay) {
          return this.loadReceipt(
            this.prisma.client as unknown as Transaction,
            command.actor.tenantId,
            command.providerId,
            replay.saleId,
            true,
          );
        }
        throw new ConflictException('Concurrent POS checkout conflict');
      }
      if (isSerializableConflict(error)) {
        throw new ConflictException('Concurrent POS checkout conflict');
      }
      throw error;
    }
  }

  async getSale(actor: PosActor, providerId: string, saleId: string) {
    await assertTrustedProviderAccess(this.prisma.client, actor, providerId);
    return this.loadReceipt(
      this.prisma.client as unknown as Transaction,
      actor.tenantId,
      providerId,
      saleId,
      false,
    );
  }

  async reprintInvoice(command: ReprintPharmacyInvoiceCommand) {
    await assertTrustedProviderAccess(this.prisma.client, command.actor, command.providerId);
    return withSerializableRetry(
      this.prisma.client,
      async (transaction) => {
        const sale = await transaction.pharmacySale.findFirst({
          where: {
            id: command.saleId,
            tenantId: command.actor.tenantId,
            providerId: command.providerId,
          },
          select: {
            id: true,
            invoice: { select: { id: true, invoiceNumber: true } },
          },
        });
        if (!sale?.invoice) throw new NotFoundException('POS sale invoice not found');

        const now = await this.databaseNow(transaction);
        await transaction.pharmacyInvoiceReprint.create({
          data: {
            tenantId: command.actor.tenantId,
            providerId: command.providerId,
            invoiceId: sale.invoice.id,
            actorMembershipId: command.actor.membershipId,
            actorUserId: command.actor.userId,
          },
          select: { id: true },
        });
        await this.audit.appendTenantUser(transaction, {
          tenantId: command.actor.tenantId,
          actorMembershipId: command.actor.membershipId,
          actorUserId: command.actor.userId,
          eventType: 'billing.pos.invoice.reprinted',
          outcome: 'SUCCEEDED',
          resourceType: 'PharmacyInvoice',
          resourceId: sale.invoice.id,
          occurredAt: now,
          metadata: {
            providerId: command.providerId,
            saleId: command.saleId,
            invoiceNumber: sale.invoice.invoiceNumber,
          },
          request: command.request,
        });
        await this.events.appendTenantUser(transaction, command.actor, {
          eventType: 'billing.pos.invoice.reprinted',
          aggregateType: 'PharmacyInvoice',
          aggregateId: sale.invoice.id,
          occurredAt: now,
          payload: {
            providerId: command.providerId,
            saleId: command.saleId,
            invoiceNumber: sale.invoice.invoiceNumber,
          },
        });

        return this.loadReceipt(
          transaction,
          command.actor.tenantId,
          command.providerId,
          command.saleId,
          false,
        );
      },
      SERIALIZABLE_ATTEMPTS,
    );
  }

  async voidSale(command: VoidPharmacySaleCommand) {
    this.validateVoid(command);
    const commandHash = createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: command.actor.tenantId,
          providerId: command.providerId,
          saleId: command.saleId,
          reason: command.reason,
        }),
      )
      .digest('hex');

    try {
      return await withSerializableRetry(
        this.prisma.client,
        async (transaction) => {
          await assertTrustedProviderAccess(transaction, command.actor, command.providerId);

          const replay = await transaction.pharmacySaleCommand.findFirst({
            where: {
              tenantId: command.actor.tenantId,
              idempotencyKey: command.idempotencyKey,
            },
            select: { saleId: true, commandType: true, commandHash: true },
          });
          if (replay) {
            if (
              replay.commandType !== 'VOID' ||
              replay.commandHash !== commandHash ||
              replay.saleId !== command.saleId
            ) {
              throw new ConflictException('Idempotency key is already used by another POS command');
            }
            return this.loadReceipt(
              transaction,
              command.actor.tenantId,
              command.providerId,
              command.saleId,
              true,
            );
          }

          const sale = await transaction.pharmacySale.findFirst({
            where: {
              id: command.saleId,
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
            },
            select: {
              id: true,
              status: true,
              reservationId: true,
              lines: {
                select: {
                  quantity: true,
                  allocations: {
                    select: {
                      id: true,
                      quantity: true,
                      lineId: true,
                      inventoryId: true,
                      productId: true,
                      batchId: true,
                      batch: {
                        select: {
                          onHandQuantity: true,
                          heldQuantity: true,
                          version: true,
                          status: true,
                          expiryDate: true,
                          deletedAt: true,
                        },
                      },
                    },
                    orderBy: { id: 'asc' },
                  },
                },
              },
              invoice: { select: { invoiceNumber: true } },
            },
          });
          if (!sale?.invoice) throw new NotFoundException('POS sale not found');
          if (sale.status !== 'COMPLETED') {
            throw new ConflictException('Only a completed POS sale can be voided');
          }

          const now = await this.databaseNow(transaction);
          const saleAllocations = sale.lines.flatMap((line) => line.allocations);
          for (const allocation of saleAllocations) {
            if (allocation.batch.deletedAt !== null) {
              throw new ConflictException('Cannot void a sale whose source batch was deleted');
            }
            const nextStatus =
              allocation.batch.status === 'EXHAUSTED' &&
              allocation.batch.expiryDate.getTime() > now.getTime()
                ? 'ACTIVE'
                : allocation.batch.status;
            const updated = await transaction.batch.updateMany({
              where: {
                id: allocation.batchId,
                tenantId: command.actor.tenantId,
                inventoryId: allocation.inventoryId,
                providerId: command.providerId,
                productId: allocation.productId,
                onHandQuantity: allocation.batch.onHandQuantity,
                heldQuantity: allocation.batch.heldQuantity,
                version: allocation.batch.version,
                status: allocation.batch.status,
                deletedAt: null,
              },
              data: {
                onHandQuantity: { increment: allocation.quantity },
                status: nextStatus,
                version: { increment: 1 },
              },
            });
            if (updated.count !== 1) {
              throw new SerializableRetryError('Concurrent POS void stock restoration detected');
            }

            await transaction.stockMovement.create({
              data: {
                tenantId: command.actor.tenantId,
                inventoryId: allocation.inventoryId,
                batchId: allocation.batchId,
                providerId: command.providerId,
                productId: allocation.productId,
                type: 'STOCK_IN',
                delta: allocation.quantity,
                onHandBefore: allocation.batch.onHandQuantity,
                onHandAfter: allocation.batch.onHandQuantity + allocation.quantity,
                referenceType: 'pharmacy.sale.void',
                referenceId: command.saleId,
                reason: 'POS sale void stock restoration',
                idempotencyKey: this.voidMovementKey(command.idempotencyKey, allocation.id),
                commandHash,
                resultingBatchVersion: allocation.batch.version + 1,
                actorType: 'TENANT_USER',
                actorMembershipId: command.actor.membershipId,
                occurredAt: now,
              },
              select: { id: true },
            });
          }

          const updatedSale = await transaction.pharmacySale.updateMany({
            where: {
              id: command.saleId,
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              status: 'COMPLETED',
              voidedAt: null,
            },
            data: { status: 'VOIDED', voidedAt: now },
          });
          if (updatedSale.count !== 1) {
            throw new SerializableRetryError('Concurrent POS void detected');
          }

          await transaction.pharmacySaleVoid.create({
            data: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              saleId: command.saleId,
              actorMembershipId: command.actor.membershipId,
              actorUserId: command.actor.userId,
              reason: command.reason,
              idempotencyKey: command.idempotencyKey,
              commandHash,
              occurredAt: now,
            },
            select: { id: true },
          });
          await transaction.pharmacySaleCommand.create({
            data: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              saleId: command.saleId,
              commandType: 'VOID',
              idempotencyKey: command.idempotencyKey,
              commandHash,
            },
            select: { id: true },
          });

          const totalQuantity = sale.lines.reduce((total, line) => total + line.quantity, 0);
          await this.audit.appendTenantUser(transaction, {
            tenantId: command.actor.tenantId,
            actorMembershipId: command.actor.membershipId,
            actorUserId: command.actor.userId,
            eventType: 'billing.pos.sale.voided',
            outcome: 'SUCCEEDED',
            resourceType: 'PharmacySale',
            resourceId: command.saleId,
            occurredAt: now,
            metadata: {
              providerId: command.providerId,
              lineCount: sale.lines.length,
              totalQuantity,
              invoiceNumber: sale.invoice.invoiceNumber,
            },
            request: command.request,
          });
          await this.events.appendTenantUser(transaction, command.actor, {
            eventType: 'billing.pos.sale.voided',
            aggregateType: 'PharmacySale',
            aggregateId: command.saleId,
            occurredAt: now,
            payload: {
              providerId: command.providerId,
              lineCount: sale.lines.length,
              totalQuantity,
              invoiceNumber: sale.invoice.invoiceNumber,
            },
          });

          return this.loadReceipt(
            transaction,
            command.actor.tenantId,
            command.providerId,
            command.saleId,
            false,
          );
        },
        SERIALIZABLE_ATTEMPTS,
      );
    } catch (error) {
      if (hasPrismaCode(error, 'P2002') || isSerializableConflict(error)) {
        throw new ConflictException('Concurrent POS void conflict');
      }
      throw error;
    }
  }

  private normalizeCheckout(command: PharmacyCheckoutCommand): {
    readonly lines: NormalizedLine[];
    readonly payments: NormalizedPayment[];
    readonly placeOfSupplyStateCode: string;
    readonly recipientName?: string;
    readonly recipientAddress?: string;
    readonly recipientGstin?: string;
  } {
    if (
      command.idempotencyKey !== command.idempotencyKey.trim() ||
      command.idempotencyKey.length < 8 ||
      command.idempotencyKey.length > 120
    ) {
      throw new BadRequestException('Idempotency key must contain 8 to 120 trimmed characters');
    }
    if (command.reservationId && !command.pickupToken) {
      throw new BadRequestException(
        'Reservation checkout requires the patient pickup proof',
      );
    }
    if (!command.reservationId && command.pickupToken !== undefined) {
      throw new BadRequestException('Pickup proof can be used only with a reservation checkout');
    }

    if (
      !Array.isArray(command.lines) ||
      command.lines.length < 1 ||
      command.lines.length > MAX_LINES
    ) {
      throw new BadRequestException('POS checkout requires 1 to 100 lines');
    }
    if (
      !Array.isArray(command.payments) ||
      command.payments.length < 1 ||
      command.payments.length > MAX_PAYMENTS
    ) {
      throw new BadRequestException('POS checkout requires 1 to 4 payments');
    }
    if (!STATE_CODE_PATTERN.test(command.placeOfSupplyStateCode)) {
      throw new BadRequestException('Place of supply must contain exactly two digits');
    }

    const lines = command.lines
      .map((line) => {
        if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
          throw new BadRequestException('POS line quantity must be a positive safe integer');
        }
        return { productId: line.productId, quantity: line.quantity };
      })
      .sort((left, right) => left.productId.localeCompare(right.productId));
    if (new Set(lines.map((line) => line.productId)).size !== lines.length) {
      throw new BadRequestException('POS checkout cannot contain duplicate product lines');
    }

    const payments = command.payments.map((payment) => {
      const amount = this.normalizeMoney(payment.amount, 'Payment amount');
      if (parseMoneyToPaise(amount) <= 0n) {
        throw new BadRequestException('Payment amount must be greater than zero');
      }
      const externalReference = this.optionalTrimmed(
        payment.externalReference,
        80,
        'Payment reference',
      );
      return {
        method: payment.method,
        amount,
        ...(externalReference ? { externalReference } : {}),
      };
    });

    const recipientName = this.optionalTrimmed(command.recipientName, 200, 'Recipient name');
    const recipientAddress = this.optionalTrimmed(
      command.recipientAddress,
      500,
      'Recipient address',
    );
    const recipientGstin = this.optionalTrimmed(command.recipientGstin, 15, 'Recipient GSTIN');
    if (recipientGstin) {
      if (!GSTIN_PATTERN.test(recipientGstin)) {
        throw new BadRequestException('Recipient GSTIN is invalid');
      }
      if (recipientGstin.slice(0, 2) !== command.placeOfSupplyStateCode) {
        throw new BadRequestException('Recipient GSTIN state prefix must match place of supply');
      }
      if (!recipientName || !recipientAddress) {
        throw new BadRequestException(
          'Recipient name and address are required with recipient GSTIN',
        );
      }
    }

    return {
      lines,
      payments,
      placeOfSupplyStateCode: command.placeOfSupplyStateCode,
      ...(recipientName ? { recipientName } : {}),
      ...(recipientAddress ? { recipientAddress } : {}),
      ...(recipientGstin ? { recipientGstin } : {}),
    };
  }

  private checkoutHash(
    command: PharmacyCheckoutCommand,
    lines: readonly NormalizedLine[],
    payments: readonly NormalizedPayment[],
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: command.actor.tenantId,
          providerId: command.providerId,
          lines,
          payments,
          reservationId: command.reservationId ?? null,
          pickupProofHash: command.pickupToken
            ? createHash('sha256').update(command.pickupToken).digest('hex')
            : null,
          placeOfSupplyStateCode: command.placeOfSupplyStateCode,
          recipientName: command.recipientName ?? null,
          recipientAddress: command.recipientAddress ?? null,
          recipientGstin: command.recipientGstin ?? null,
          cashTendered:
            command.cashTendered === undefined
              ? null
              : this.normalizeMoney(command.cashTendered, 'Cash tendered'),
        }),
      )
      .digest('hex');
  }

  private async findCheckoutReplay(
    database: Pick<Transaction, 'pharmacySaleCommand'>,
    tenantId: string,
    idempotencyKey: string,
    commandHash: string,
  ): Promise<{ readonly saleId: string } | null> {
    const existing = await database.pharmacySaleCommand.findFirst({
      where: { tenantId, idempotencyKey },
      select: { saleId: true, commandType: true, commandHash: true },
    });
    if (!existing) return null;
    if (existing.commandType !== 'CHECKOUT' || existing.commandHash !== commandHash) {
      throw new ConflictException('Idempotency key is already used by another POS command');
    }
    return { saleId: existing.saleId };
  }

  private async loadReadyReservation(
    transaction: Transaction,
    command: PharmacyCheckoutCommand,
    lines: readonly NormalizedLine[],
    now: Date,
  ) {
    const reservation = await transaction.medicineReservation.findFirst({
      where: {
        id: command.reservationId,
        tenantId: command.actor.tenantId,
        providerId: command.providerId,
      },
      select: {
        id: true,
        subjectUserId: true,
        status: true,
        version: true,
        expiresAt: true,
        items: {
          select: { id: true, productId: true, quantity: true },
          orderBy: { productId: 'asc' },
        },
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
                status: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!reservation) throw new NotFoundException('Medicine reservation not found');
    if (reservation.status !== 'READY') {
      throw new ConflictException('Only a ready medicine reservation can be checked out');
    }
    if (reservation.expiresAt.getTime() <= now.getTime()) {
      throw new ConflictException('Expired medicine reservation awaits system expiry');
    }

    const reservedLines = reservation.items
      .map((item) => ({ productId: item.productId, quantity: item.quantity }))
      .sort((left, right) => left.productId.localeCompare(right.productId));
    if (JSON.stringify(reservedLines) !== JSON.stringify(lines)) {
      throw new ConflictException('POS cart must exactly match the ready reservation');
    }

    const heldByProduct = new Map<string, number>();
    for (const allocation of reservation.allocations) {
      heldByProduct.set(
        allocation.productId,
        (heldByProduct.get(allocation.productId) ?? 0) + allocation.quantity,
      );
    }
    for (const line of lines) {
      if (heldByProduct.get(line.productId) !== line.quantity) {
        throw new ConflictException('Medicine reservation holds are incomplete');
      }
    }

    return reservation;
  }

  private async commitWalkInStock(
    transaction: Transaction,
    command: PharmacyCheckoutCommand,
    lines: readonly PreparedLine[],
    saleId: string,
    commandHash: string,
    now: Date,
  ): Promise<void> {
    for (const line of lines) {
      let allocations;
      try {
        allocations = planReservationFefo(line.inventory.batches, line.quantity);
      } catch (error) {
        if (error instanceof InsufficientReservationStockError) {
          throw new ConflictException('Insufficient eligible stock for POS checkout');
        }
        throw error;
      }

      for (const allocation of allocations) {
        const batch = line.inventory.batches.find(
          (candidate) => candidate.id === allocation.batchId,
        );
        if (!batch) throw new ConflictException('FEFO allocation lost its source batch');
        const onHandAfter = batch.onHandQuantity - allocation.quantity;
        if (onHandAfter < batch.heldQuantity) {
          throw new ConflictException('POS checkout cannot consume reserved stock');
        }

        const updated = await transaction.batch.updateMany({
          where: {
            id: batch.id,
            tenantId: command.actor.tenantId,
            inventoryId: line.inventory.id,
            providerId: command.providerId,
            productId: line.inventory.productId,
            status: 'ACTIVE',
            expiryDate: { gt: now },
            onHandQuantity: batch.onHandQuantity,
            heldQuantity: batch.heldQuantity,
            version: batch.version,
            deletedAt: null,
          },
          data: {
            onHandQuantity: { decrement: allocation.quantity },
            status: onHandAfter === 0 ? 'EXHAUSTED' : 'ACTIVE',
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new SerializableRetryError('Concurrent POS FEFO stock consumption detected');
        }

        const movement = await transaction.stockMovement.create({
          data: {
            tenantId: command.actor.tenantId,
            inventoryId: line.inventory.id,
            batchId: batch.id,
            providerId: command.providerId,
            productId: line.inventory.productId,
            type: 'STOCK_OUT',
            delta: -allocation.quantity,
            onHandBefore: batch.onHandQuantity,
            onHandAfter,
            referenceType: 'pharmacy.sale.checkout',
            referenceId: saleId,
            reason: 'Pharmacy POS checkout',
            idempotencyKey: this.movementKey(command.idempotencyKey, line.id, batch.id),
            commandHash,
            resultingBatchVersion: batch.version + 1,
            actorType: 'TENANT_USER',
            actorMembershipId: command.actor.membershipId,
            occurredAt: now,
          },
          select: { id: true },
        });
        await transaction.pharmacySaleAllocation.create({
          data: {
            tenantId: command.actor.tenantId,
            providerId: command.providerId,
            lineId: line.id,
            saleId,
            inventoryId: line.inventory.id,
            productId: line.inventory.productId,
            batchId: batch.id,
            stockMovementId: movement.id,
            quantity: allocation.quantity,
          },
          select: { id: true },
        });
      }
    }
  }

  private async commitReservationStock(
    transaction: Transaction,
    command: PharmacyCheckoutCommand,
    reservation: NonNullable<Awaited<ReturnType<PosCheckoutService['loadReadyReservation']>>>,
    lines: readonly PreparedLine[],
    saleId: string,
    commandHash: string,
    now: Date,
  ): Promise<void> {
    const lineByProduct = new Map(lines.map((line) => [line.inventory.productId, line]));

    for (const allocation of reservation.allocations) {
      const line = lineByProduct.get(allocation.productId);
      if (!line) throw new ConflictException('Reservation allocation does not match POS cart');
      if (
        allocation.batch.status !== 'ACTIVE' ||
        allocation.batch.expiryDate.getTime() <= now.getTime()
      ) {
        throw new ConflictException('Reservation contains stock that is no longer eligible');
      }
      const onHandAfter = allocation.batch.onHandQuantity - allocation.quantity;
      const heldAfter = allocation.batch.heldQuantity - allocation.quantity;
      if (onHandAfter < 0 || heldAfter < 0) {
        throw new ConflictException('Reservation allocation exceeds current batch stock');
      }

      const updated = await transaction.batch.updateMany({
        where: {
          id: allocation.batchId,
          tenantId: command.actor.tenantId,
          inventoryId: allocation.inventoryId,
          providerId: command.providerId,
          productId: allocation.productId,
          status: 'ACTIVE',
          expiryDate: { gt: now },
          onHandQuantity: allocation.batch.onHandQuantity,
          heldQuantity: allocation.batch.heldQuantity,
          version: allocation.batch.version,
          deletedAt: null,
        },
        data: {
          onHandQuantity: { decrement: allocation.quantity },
          heldQuantity: { decrement: allocation.quantity },
          status: onHandAfter === 0 ? 'EXHAUSTED' : 'ACTIVE',
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new SerializableRetryError('Concurrent reserved POS stock consumption detected');
      }

      const allocationUpdated = await transaction.medicineReservationAllocation.updateMany({
        where: { id: allocation.id, status: 'HELD' },
        data: { status: 'CONSUMED', consumedAt: now },
      });
      if (allocationUpdated.count !== 1) {
        throw new SerializableRetryError('Concurrent reservation allocation update detected');
      }

      const movement = await transaction.stockMovement.create({
        data: {
          tenantId: command.actor.tenantId,
          inventoryId: allocation.inventoryId,
          batchId: allocation.batchId,
          providerId: command.providerId,
          productId: allocation.productId,
          type: 'STOCK_OUT',
          delta: -allocation.quantity,
          onHandBefore: allocation.batch.onHandQuantity,
          onHandAfter,
          referenceType: 'pharmacy.sale.checkout.reservation',
          referenceId: saleId,
          reason: 'POS checkout from ready medicine reservation',
          idempotencyKey: this.movementKey(command.idempotencyKey, line.id, allocation.batchId),
          commandHash,
          resultingBatchVersion: allocation.batch.version + 1,
          actorType: 'TENANT_USER',
          actorMembershipId: command.actor.membershipId,
          occurredAt: now,
        },
        select: { id: true },
      });
      await transaction.pharmacySaleAllocation.create({
        data: {
          tenantId: command.actor.tenantId,
          providerId: command.providerId,
          lineId: line.id,
          saleId,
          inventoryId: allocation.inventoryId,
          productId: allocation.productId,
          batchId: allocation.batchId,
          stockMovementId: movement.id,
          quantity: allocation.quantity,
        },
        select: { id: true },
      });
    }

    const resultingVersion = reservation.version + 1;
    const updatedReservation = await transaction.medicineReservation.updateMany({
      where: {
        id: reservation.id,
        tenantId: command.actor.tenantId,
        providerId: command.providerId,
        status: 'READY',
        version: reservation.version,
      },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        version: { increment: 1 },
      },
    });
    if (updatedReservation.count !== 1) {
      throw new SerializableRetryError('Concurrent reservation-to-sale transition detected');
    }

    const totalQuantity = reservation.items.reduce((total, item) => total + item.quantity, 0);
    await transaction.medicineReservationCommand.create({
      data: {
        tenantId: command.actor.tenantId,
        reservationId: reservation.id,
        providerId: command.providerId,
        commandType: 'COMPLETE',
        idempotencyKey: this.reservationCommandKey(saleId),
        commandHash,
        resultingStatus: 'COMPLETED',
        resultingVersion,
      },
      select: { id: true },
    });
    await writeReservationTimelineEvent(transaction, {
      reservationId: reservation.id,
      recipientUserId: reservation.subjectUserId,
      status: 'COMPLETED',
      version: resultingVersion,
      occurredAt: now,
    });
    await this.audit.appendTenantUser(transaction, {
      tenantId: command.actor.tenantId,
      actorMembershipId: command.actor.membershipId,
      actorUserId: command.actor.userId,
      eventType: 'inventory.reservation.completed',
      outcome: 'SUCCEEDED',
      resourceType: 'MedicineReservation',
      resourceId: reservation.id,
      occurredAt: now,
      metadata: {
        previousStatus: 'READY',
        version: resultingVersion,
        totalQuantity,
      },
      request: command.request,
    });
    await this.inventoryEvents.appendTenantUser(transaction, command.actor, {
      eventType: 'inventory.reservation.completed',
      aggregateType: 'MedicineReservation',
      aggregateId: reservation.id,
      occurredAt: now,
      payload: {
        providerId: command.providerId,
        previousStatus: 'READY',
        status: 'COMPLETED',
        version: resultingVersion,
        totalQuantity,
      },
    });
  }

  private async allocateInvoiceNumber(
    transaction: Transaction,
    tenantId: string,
    providerId: string,
    financialYear: string,
    series: string,
  ): Promise<string> {
    const sequence = await transaction.pharmacyInvoiceSequence.upsert({
      where: {
        tenantId_providerId_financialYear_series: {
          tenantId,
          providerId,
          financialYear,
          series,
        },
      },
      create: {
        tenantId,
        providerId,
        financialYear,
        series,
        nextNumber: 2,
      },
      update: {
        nextNumber: { increment: 1 },
        version: { increment: 1 },
      },
      select: { nextNumber: true },
    });
    const allocated = sequence.nextNumber - 1;
    if (!Number.isSafeInteger(allocated) || allocated < 1 || allocated > 99_999_999) {
      throw new ConflictException('Invoice number sequence is exhausted or invalid');
    }
    return series + '/' + String(allocated).padStart(8, '0');
  }

  private async loadReceipt(
    database: Pick<Transaction, 'pharmacySale'>,
    tenantId: string,
    providerId: string,
    saleId: string,
    replayed: boolean,
  ) {
    const sale = await database.pharmacySale.findFirst({
      where: { id: saleId, tenantId, providerId },
      select: {
        id: true,
        providerId: true,
        reservationId: true,
        status: true,
        currency: true,
        pricesIncludeTax: true,
        subtotal: true,
        discountTotal: true,
        taxableTotal: true,
        cgstTotal: true,
        sgstTotal: true,
        igstTotal: true,
        cessTotal: true,
        grandTotal: true,
        cashTendered: true,
        changeDue: true,
        placeOfSupplyStateCode: true,
        recipientName: true,
        recipientAddress: true,
        recipientGstin: true,
        completedAt: true,
        voidedAt: true,
        lines: {
          orderBy: { lineNumber: 'asc' },
          select: {
            id: true,
            lineNumber: true,
            productId: true,
            quantity: true,
            productNameSnapshot: true,
            brandSnapshot: true,
            strengthSnapshot: true,
            dosageFormSnapshot: true,
            hsnCodeSnapshot: true,
            uqcSnapshot: true,
            unitPrice: true,
            mrp: true,
            grossValue: true,
            discountPercentage: true,
            discountAmount: true,
            taxableValue: true,
            gstPercentage: true,
            cessPercentage: true,
            cgstAmount: true,
            sgstAmount: true,
            igstAmount: true,
            cessAmount: true,
            lineTotal: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'asc' },
          select: { method: true, amount: true, externalReference: true },
        },
        invoice: {
          select: {
            id: true,
            documentType: true,
            financialYear: true,
            invoiceNumber: true,
            issuedAt: true,
            supplierLegalName: true,
            supplierAddress: true,
            supplierGstin: true,
            supplierStateCode: true,
            placeOfSupplyStateCode: true,
            recipientName: true,
            recipientAddress: true,
            recipientGstin: true,
            subtotal: true,
            discountTotal: true,
            taxableTotal: true,
            cgstTotal: true,
            sgstTotal: true,
            igstTotal: true,
            cessTotal: true,
            grandTotal: true,
            _count: { select: { reprints: true } },
          },
        },
        voidRecord: { select: { reason: true, occurredAt: true } },
      },
    });
    if (!sale?.invoice) throw new NotFoundException('POS sale not found');

    return {
      saleId: sale.id,
      providerId: sale.providerId,
      reservationId: sale.reservationId,
      status: sale.status,
      currency: sale.currency,
      pricesIncludeTax: sale.pricesIncludeTax,
      subtotal: this.formatStoredMoney(sale.subtotal),
      discountTotal: this.formatStoredMoney(sale.discountTotal),
      taxableTotal: this.formatStoredMoney(sale.taxableTotal),
      cgstTotal: this.formatStoredMoney(sale.cgstTotal),
      sgstTotal: this.formatStoredMoney(sale.sgstTotal),
      igstTotal: this.formatStoredMoney(sale.igstTotal),
      cessTotal: this.formatStoredMoney(sale.cessTotal),
      grandTotal: this.formatStoredMoney(sale.grandTotal),
      cashTendered: sale.cashTendered === null ? null : this.formatStoredMoney(sale.cashTendered),
      changeDue: sale.changeDue === null ? null : this.formatStoredMoney(sale.changeDue),
      placeOfSupplyStateCode: sale.placeOfSupplyStateCode,
      recipientName: sale.recipientName,
      recipientAddress: sale.recipientAddress,
      recipientGstin: sale.recipientGstin,
      completedAt: sale.completedAt.toISOString(),
      voidedAt: sale.voidedAt?.toISOString() ?? null,
      lines: sale.lines.map(({ id, ...line }) => ({
        ...line,
        saleLineId: id,
        unitPrice: this.formatStoredMoney(line.unitPrice),
        mrp: this.formatStoredMoney(line.mrp),
        grossValue: this.formatStoredMoney(line.grossValue),
        discountPercentage: String(line.discountPercentage),
        discountAmount: this.formatStoredMoney(line.discountAmount),
        taxableValue: this.formatStoredMoney(line.taxableValue),
        gstPercentage: String(line.gstPercentage),
        cessPercentage: String(line.cessPercentage),
        cgstAmount: this.formatStoredMoney(line.cgstAmount),
        sgstAmount: this.formatStoredMoney(line.sgstAmount),
        igstAmount: this.formatStoredMoney(line.igstAmount),
        cessAmount: this.formatStoredMoney(line.cessAmount),
        lineTotal: this.formatStoredMoney(line.lineTotal),
      })),
      payments: sale.payments.map((payment) => ({
        ...payment,
        amount: this.formatStoredMoney(payment.amount),
      })),
      invoice: {
        id: sale.invoice.id,
        documentType: sale.invoice.documentType,
        financialYear: sale.invoice.financialYear,
        invoiceNumber: sale.invoice.invoiceNumber,
        issuedAt: sale.invoice.issuedAt.toISOString(),
        supplierLegalName: sale.invoice.supplierLegalName,
        supplierAddress: sale.invoice.supplierAddress,
        supplierGstin: sale.invoice.supplierGstin,
        supplierStateCode: sale.invoice.supplierStateCode,
        placeOfSupplyStateCode: sale.invoice.placeOfSupplyStateCode,
        recipientName: sale.invoice.recipientName,
        recipientAddress: sale.invoice.recipientAddress,
        recipientGstin: sale.invoice.recipientGstin,
        subtotal: this.formatStoredMoney(sale.invoice.subtotal),
        discountTotal: this.formatStoredMoney(sale.invoice.discountTotal),
        taxableTotal: this.formatStoredMoney(sale.invoice.taxableTotal),
        cgstTotal: this.formatStoredMoney(sale.invoice.cgstTotal),
        sgstTotal: this.formatStoredMoney(sale.invoice.sgstTotal),
        igstTotal: this.formatStoredMoney(sale.invoice.igstTotal),
        cessTotal: this.formatStoredMoney(sale.invoice.cessTotal),
        grandTotal: this.formatStoredMoney(sale.invoice.grandTotal),
        reprintCount: sale.invoice._count.reprints,
      },
      voidRecord: sale.voidRecord
        ? {
            reason: sale.voidRecord.reason,
            occurredAt: sale.voidRecord.occurredAt.toISOString(),
          }
        : null,
      replayed,
    };
  }

  private validateProductSnapshot(inventory: InventoryForSale): void {
    if (
      inventory.product.name.length < 1 ||
      inventory.product.name.length > 240 ||
      inventory.product.brand.length < 1 ||
      inventory.product.brand.length > 240 ||
      inventory.product.strength.length < 1 ||
      inventory.product.strength.length > 80 ||
      inventory.product.dosageForm.length < 1 ||
      inventory.product.dosageForm.length > 80
    ) {
      throw new ConflictException('Product snapshot fields exceed POS invoice limits');
    }
  }

  private validateVoid(command: VoidPharmacySaleCommand): void {
    if (
      command.idempotencyKey !== command.idempotencyKey.trim() ||
      command.idempotencyKey.length < 8 ||
      command.idempotencyKey.length > 120
    ) {
      throw new BadRequestException('Idempotency key must contain 8 to 120 trimmed characters');
    }
    if (
      command.reason !== command.reason.trim() ||
      command.reason.length < 1 ||
      command.reason.length > 500
    ) {
      throw new BadRequestException('Void reason must contain 1 to 500 trimmed characters');
    }
  }

  private formatStoredMoney(value: Prisma.Decimal): string {
    const paise = parseMoneyToPaise(String(value));
    return String(paise / 100n) + '.' + String(paise % 100n).padStart(2, '0');
  }

  private normalizeMoney(value: string, label: string): string {
    try {
      const paise = parseMoneyToPaise(value);
      return String(paise / 100n) + '.' + String(paise % 100n).padStart(2, '0');
    } catch {
      throw new BadRequestException(label + ' is invalid');
    }
  }

  private optionalTrimmed(
    value: string | undefined,
    maxLength: number,
    label: string,
  ): string | undefined {
    if (value === undefined) return undefined;
    if (value !== value.trim() || value.length < 1 || value.length > maxLength) {
      throw new BadRequestException(label + ' must be a non-empty trimmed value');
    }
    return value;
  }

  private movementKey(idempotencyKey: string, lineId: string, batchId: string): string {
    return (
      'pos:' +
      createHash('sha256')
        .update(idempotencyKey + ':' + lineId + ':' + batchId)
        .digest('hex')
    );
  }

  private voidMovementKey(idempotencyKey: string, allocationId: string): string {
    return (
      'pos-void:' +
      createHash('sha256')
        .update(idempotencyKey + ':' + allocationId)
        .digest('hex')
    );
  }

  private reservationCommandKey(saleId: string): string {
    return 'pos-reservation:' + createHash('sha256').update(saleId).digest('hex');
  }

  private async databaseNow(transaction: Transaction): Promise<Date> {
    const [row] = await transaction.$queryRawUnsafe<Array<{ now: Date }>>(
      'SELECT CURRENT_TIMESTAMP AS "now"',
    );
    if (!row?.now) throw new Error('Database time unavailable');
    return row.now;
  }
}
