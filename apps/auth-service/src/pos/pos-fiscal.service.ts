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
import { PrismaService } from '../prisma/prisma.service';
import { parsePercentageToBasisPoints } from './pos-money';
import type {
  ConfigureInventoryFiscalProfileCommand,
  ConfigurePharmacyFiscalProfileCommand,
  PosActor,
} from './pos.types';

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const STATE_CODE_PATTERN = /^\d{2}$/;
const INVOICE_SERIES_PATTERN = /^[A-Z0-9]{1,4}$/;
const HSN_PATTERN = /^(?:\d{4}|\d{6}|\d{8})$/;
const UQC_PATTERN = /^[A-Z]{2,8}$/;

@Injectable()
export class PosFiscalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async configurePharmacyProfile(command: ConfigurePharmacyFiscalProfileCommand) {
    this.validatePharmacyProfile(command);

    try {
      return await withSerializableRetry(this.prisma.client, async (transaction) => {
        await assertTrustedProviderAccess(transaction, command.actor, command.providerId);
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

        const existing = await transaction.pharmacyFiscalProfile.findUnique({
          where: { providerId: command.providerId },
          select: { id: true, tenantId: true, version: true },
        });
        if (existing && existing.tenantId !== command.actor.tenantId) {
          throw new NotFoundException('Assigned pharmacy provider not found');
        }

        let version = 1;
        if (!existing) {
          if (command.expectedVersion !== undefined) {
            throw new ConflictException('Fiscal profile does not yet have a version');
          }
          await transaction.pharmacyFiscalProfile.create({
            data: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              registrationType: command.registrationType,
              legalName: command.legalName,
              gstin: command.gstin,
              stateCode: command.stateCode,
              invoiceSeries: command.invoiceSeries,
              pricesIncludeTax: command.pricesIncludeTax,
            },
            select: { id: true },
          });
        } else {
          if (command.expectedVersion !== existing.version) {
            throw new ConflictException('Fiscal profile version conflict');
          }
          const updated = await transaction.pharmacyFiscalProfile.updateMany({
            where: {
              id: existing.id,
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              version: existing.version,
            },
            data: {
              registrationType: command.registrationType,
              legalName: command.legalName,
              gstin: command.gstin ?? null,
              stateCode: command.stateCode,
              invoiceSeries: command.invoiceSeries,
              pricesIncludeTax: command.pricesIncludeTax,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            throw new SerializableRetryError('Concurrent fiscal profile update detected');
          }
          version = existing.version + 1;
        }

        const now = await this.databaseNow(transaction);
        await this.audit.appendTenantUser(transaction, {
          tenantId: command.actor.tenantId,
          actorMembershipId: command.actor.membershipId,
          actorUserId: command.actor.userId,
          eventType: 'billing.pos.fiscal-profile.configured',
          outcome: 'SUCCEEDED',
          resourceType: 'PharmacyFiscalProfile',
          resourceId: command.providerId,
          occurredAt: now,
          metadata: {
            providerId: command.providerId,
            registrationType: command.registrationType,
            version,
          },
          request: command.request,
        });

        return {
          providerId: command.providerId,
          registrationType: command.registrationType,
          legalName: command.legalName,
          gstin: command.gstin ?? null,
          stateCode: command.stateCode,
          invoiceSeries: command.invoiceSeries,
          pricesIncludeTax: command.pricesIncludeTax,
          version,
        };
      });
    } catch (error) {
      if (isSerializableConflict(error) || hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Concurrent fiscal profile update detected');
      }
      throw error;
    }
  }

  async configureInventoryProfile(command: ConfigureInventoryFiscalProfileCommand) {
    this.validateInventoryProfile(command);

    try {
      return await withSerializableRetry(this.prisma.client, async (transaction) => {
        await assertTrustedProviderAccess(transaction, command.actor, command.providerId);
        const inventory = await transaction.inventory.findFirst({
          where: {
            id: command.inventoryId,
            tenantId: command.actor.tenantId,
            providerId: command.providerId,
            deletedAt: null,
            product: { isActive: true, deletedAt: null },
          },
          select: { id: true, productId: true },
        });
        if (!inventory) throw new NotFoundException('Assigned pharmacy inventory not found');

        const existing = await transaction.inventoryFiscalProfile.findUnique({
          where: { inventoryId: command.inventoryId },
          select: { id: true, tenantId: true, providerId: true, productId: true, version: true },
        });
        if (
          existing &&
          (existing.tenantId !== command.actor.tenantId ||
            existing.providerId !== command.providerId ||
            existing.productId !== inventory.productId)
        ) {
          throw new NotFoundException('Assigned pharmacy inventory not found');
        }

        let version = 1;
        if (!existing) {
          if (command.expectedVersion !== undefined) {
            throw new ConflictException('Inventory fiscal profile does not yet have a version');
          }
          await transaction.inventoryFiscalProfile.create({
            data: {
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              inventoryId: command.inventoryId,
              productId: inventory.productId,
              hsnCode: command.hsnCode,
              uqc: command.uqc,
              cessPercentage: command.cessPercentage,
            },
            select: { id: true },
          });
        } else {
          if (command.expectedVersion !== existing.version) {
            throw new ConflictException('Inventory fiscal profile version conflict');
          }
          const updated = await transaction.inventoryFiscalProfile.updateMany({
            where: {
              id: existing.id,
              tenantId: command.actor.tenantId,
              providerId: command.providerId,
              inventoryId: command.inventoryId,
              productId: inventory.productId,
              version: existing.version,
            },
            data: {
              hsnCode: command.hsnCode,
              uqc: command.uqc,
              cessPercentage: command.cessPercentage,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            throw new SerializableRetryError('Concurrent inventory fiscal profile update detected');
          }
          version = existing.version + 1;
        }

        const now = await this.databaseNow(transaction);
        await this.audit.appendTenantUser(transaction, {
          tenantId: command.actor.tenantId,
          actorMembershipId: command.actor.membershipId,
          actorUserId: command.actor.userId,
          eventType: 'billing.pos.inventory-fiscal-profile.configured',
          outcome: 'SUCCEEDED',
          resourceType: 'InventoryFiscalProfile',
          resourceId: command.inventoryId,
          occurredAt: now,
          metadata: { providerId: command.providerId, productId: inventory.productId, version },
          request: command.request,
        });

        return {
          providerId: command.providerId,
          inventoryId: command.inventoryId,
          productId: inventory.productId,
          hsnCode: command.hsnCode,
          uqc: command.uqc,
          cessPercentage: command.cessPercentage,
          version,
        };
      });
    } catch (error) {
      if (isSerializableConflict(error) || hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Concurrent inventory fiscal profile update detected');
      }
      throw error;
    }
  }

  async getPharmacyProfile(actor: PosActor, providerId: string) {
    await assertTrustedProviderAccess(this.prisma.client, actor, providerId);
    const provider = await this.prisma.client.provider.findFirst({
      where: {
        id: providerId,
        tenantId: actor.tenantId,
        providerType: 'PHARMACY',
        deletedAt: null,
      },
      select: {
        id: true,
        businessName: true,
        address: true,
        isActive: true,
        pharmacyFiscalProfile: {
          select: {
            registrationType: true,
            legalName: true,
            gstin: true,
            stateCode: true,
            invoiceSeries: true,
            pricesIncludeTax: true,
            version: true,
          },
        },
      },
    });
    if (!provider) throw new NotFoundException('Assigned pharmacy provider not found');
    return {
      providerId,
      businessName: provider.businessName,
      address: provider.address,
      isActive: provider.isActive,
      fiscalProfile: provider.pharmacyFiscalProfile,
    };
  }

  async getProductQuote(actor: PosActor, providerId: string, productId: string) {
    await assertTrustedProviderAccess(this.prisma.client, actor, providerId);
    const now = new Date();
    const inventory = await this.prisma.client.inventory.findFirst({
      where: {
        tenantId: actor.tenantId,
        providerId,
        productId,
        deletedAt: null,
        product: { isActive: true, deletedAt: null },
      },
      select: {
        id: true,
        isVisible: true,
        sellingPrice: true,
        mrp: true,
        discountPercentage: true,
        taxPercentage: true,
        product: {
          select: {
            id: true,
            name: true,
            genericName: true,
            brand: true,
            strength: true,
            dosageForm: true,
            requiresPrescription: true,
          },
        },
        fiscalProfile: {
          select: { hsnCode: true, uqc: true, cessPercentage: true, version: true },
        },
        batches: {
          where: { status: 'ACTIVE', expiryDate: { gt: now }, deletedAt: null },
          select: { onHandQuantity: true, heldQuantity: true },
        },
      },
    });
    if (!inventory) throw new NotFoundException('Assigned pharmacy inventory not found');

    return {
      providerId,
      inventoryId: inventory.id,
      productId: inventory.product.id,
      name: inventory.product.name,
      genericName: inventory.product.genericName,
      brand: inventory.product.brand,
      strength: inventory.product.strength,
      dosageForm: inventory.product.dosageForm,
      requiresPrescription: inventory.product.requiresPrescription,
      isVisible: inventory.isVisible,
      sellingPrice: String(inventory.sellingPrice),
      mrp: String(inventory.mrp),
      discountPercentage: String(inventory.discountPercentage),
      gstPercentage: String(inventory.taxPercentage),
      fiscalProfile: inventory.fiscalProfile
        ? {
            hsnCode: inventory.fiscalProfile.hsnCode,
            uqc: inventory.fiscalProfile.uqc,
            cessPercentage: String(inventory.fiscalProfile.cessPercentage),
            version: inventory.fiscalProfile.version,
          }
        : null,
      availableQuantity: inventory.batches.reduce(
        (total, batch) => total + Math.max(0, batch.onHandQuantity - batch.heldQuantity),
        0,
      ),
    };
  }

  private validatePharmacyProfile(command: ConfigurePharmacyFiscalProfileCommand): void {
    if (
      command.legalName !== command.legalName.trim() ||
      command.legalName.length < 1 ||
      command.legalName.length > 200
    ) {
      throw new BadRequestException('Fiscal legal name must contain 1 to 200 trimmed characters');
    }
    if (!STATE_CODE_PATTERN.test(command.stateCode)) {
      throw new BadRequestException('Fiscal state code must contain exactly two digits');
    }
    if (!INVOICE_SERIES_PATTERN.test(command.invoiceSeries)) {
      throw new BadRequestException(
        'Invoice series must contain 1 to 4 uppercase letters or digits',
      );
    }
    if (
      command.expectedVersion !== undefined &&
      (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1)
    ) {
      throw new BadRequestException('Expected version must be a positive safe integer');
    }

    if (command.registrationType === 'UNREGISTERED') {
      if (command.gstin !== undefined) {
        throw new BadRequestException('Unregistered fiscal profiles cannot contain a GSTIN');
      }
      return;
    }
    if (!command.gstin || !GSTIN_PATTERN.test(command.gstin)) {
      throw new BadRequestException('Registered fiscal profiles require a valid GSTIN');
    }
    if (command.gstin.slice(0, 2) !== command.stateCode) {
      throw new BadRequestException('GSTIN state prefix must match the fiscal state code');
    }
  }

  private validateInventoryProfile(command: ConfigureInventoryFiscalProfileCommand): void {
    if (!HSN_PATTERN.test(command.hsnCode)) {
      throw new BadRequestException('HSN code must contain 4, 6, or 8 digits');
    }
    if (!UQC_PATTERN.test(command.uqc)) {
      throw new BadRequestException('UQC must contain 2 to 8 uppercase letters');
    }
    let cess: bigint;
    try {
      cess = parsePercentageToBasisPoints(command.cessPercentage);
    } catch {
      throw new BadRequestException('CESS percentage is invalid');
    }
    if (cess > 10_000n) {
      throw new BadRequestException('CESS percentage cannot exceed 100');
    }
    if (
      command.expectedVersion !== undefined &&
      (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1)
    ) {
      throw new BadRequestException('Expected version must be a positive safe integer');
    }
  }

  private async databaseNow(transaction: Prisma.TransactionClient): Promise<Date> {
    const [row] = await transaction.$queryRawUnsafe<Array<{ now: Date }>>(
      'SELECT CURRENT_TIMESTAMP AS "now"',
    );
    if (!row?.now) throw new Error('Database time unavailable');
    return row.now;
  }
}
