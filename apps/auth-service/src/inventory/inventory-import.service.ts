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
import { AvailabilityEvidenceService } from './availability-evidence.service';
import {
  ApplyInventoryImportDto,
  InventoryImportStageRowDto,
  StageInventoryImportDto,
} from './dto/inventory-import.dto';
import { assertTrustedProviderAccess } from './inventory-access';
import type { TrustedInventoryActor } from './inventory-command.types';
import { equivalentLegacyBarcodeValues, normalizeProductIdentifier } from './product-identifier';

type StagedPayload = {
  sku: string | null;
  sellingPrice: string;
  mrp: string;
  discountPercentage: string;
  taxPercentage: string;
  minimumStockLevel: number;
  isVisible: boolean;
  batchNumber: string;
  manufacturingDate: string | null;
  expiryDate: string;
  quantity: number;
  purchasePrice: string;
  expectedInventoryVersion: number | null;
};

type MutableStagedRow = {
  id: string;
  rowNumber: number;
  productId: string | null;
  payload: StagedPayload;
  errors: string[];
};

const IMPORT_MAPPING_FIELDS = new Set([
  'productId',
  'identifier',
  'productName',
  'brand',
  'manufacturer',
  'strength',
  'dosageForm',
  'sku',
  'sellingPrice',
  'mrp',
  'discountPercentage',
  'taxPercentage',
  'minimumStockLevel',
  'isVisible',
  'batchNumber',
  'manufacturingDate',
  'expiryDate',
  'quantity',
  'purchasePrice',
]);

@Injectable()
export class InventoryImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly evidence: AvailabilityEvidenceService,
  ) {}

  async stage(
    actor: TrustedInventoryActor,
    providerId: string,
    dto: StageInventoryImportDto,
    request?: Parameters<AuditWriter['appendTenantUser']>[1]['request'],
  ) {
    this.validateIdempotencyKey(dto.stageIdempotencyKey);
    this.validateMapping(dto.mapping);
    const rowNumbers = new Set<number>();
    for (const row of dto.rows) {
      if (rowNumbers.has(row.rowNumber)) {
        throw new BadRequestException('Import row numbers must be unique');
      }
      rowNumbers.add(row.rowNumber);
    }

    const stageCommandHash = this.hash({
      tenantId: actor.tenantId,
      providerId,
      sourceFormat: dto.sourceFormat,
      sourceFileName: dto.sourceFileName,
      contentHash: dto.contentHash,
      mapping: Object.fromEntries(
        Object.entries(dto.mapping).sort(([a], [b]) => a.localeCompare(b)),
      ),
      rows: dto.rows.map((row) => this.rowHashInput(row)),
    });

    try {
      return await withSerializableRetry(this.prisma.client, async (transaction) => {
        await this.assertAssignedPharmacy(transaction, actor, providerId);

        const replay = await transaction.inventoryImportJob.findUnique({
          where: {
            tenantId_stageIdempotencyKey: {
              tenantId: actor.tenantId,
              stageIdempotencyKey: dto.stageIdempotencyKey,
            },
          },
          include: { rows: { orderBy: { rowNumber: 'asc' } } },
        });
        if (replay) {
          if (replay.stageCommandHash !== stageCommandHash) {
            throw new ConflictException(
              'Import staging idempotency key is already used by a different command',
            );
          }
          return this.toPreview(replay, true);
        }

        const stagedRows: MutableStagedRow[] = [];
        for (const row of dto.rows) {
          stagedRows.push(await this.normalizeRow(transaction, actor.tenantId, providerId, row));
        }
        this.markIntraFileConflicts(stagedRows);

        const validRowCount = stagedRows.filter((row) => row.errors.length === 0).length;
        const invalidRowCount = stagedRows.length - validRowCount;
        const jobId = randomUUID();

        await transaction.inventoryImportJob.create({
          data: {
            id: jobId,
            tenantId: actor.tenantId,
            providerId,
            stagedByMembershipId: actor.membershipId,
            sourceFormat: dto.sourceFormat,
            sourceFileName: dto.sourceFileName.trim(),
            contentHash: dto.contentHash,
            mapping: dto.mapping as Prisma.InputJsonObject,
            stageIdempotencyKey: dto.stageIdempotencyKey,
            stageCommandHash,
            rowCount: stagedRows.length,
            validRowCount,
            invalidRowCount,
            rows: {
              create: stagedRows.map((row) => ({
                id: row.id,
                tenantId: actor.tenantId,
                providerId,
                rowNumber: row.rowNumber,
                productId: row.productId,
                payload: row.payload,
                validationErrors: row.errors,
                status: row.errors.length === 0 ? 'VALID' : 'INVALID',
              })),
            },
          },
          select: { id: true },
        });

        await this.audit.appendTenantUser(transaction, {
          tenantId: actor.tenantId,
          actorMembershipId: actor.membershipId,
          actorUserId: actor.userId,
          eventType: 'inventory.import.staged',
          outcome: 'SUCCEEDED',
          resourceType: 'InventoryImportJob',
          resourceId: jobId,
          metadata: {
            providerId,
            rowCount: stagedRows.length,
            validRowCount,
            invalidRowCount,
            sourceFormat: dto.sourceFormat,
          },
          request,
        });

        const created = await transaction.inventoryImportJob.findUniqueOrThrow({
          where: { id: jobId },
          include: { rows: { orderBy: { rowNumber: 'asc' } } },
        });
        return this.toPreview(created, false);
      });
    } catch (error) {
      if (!hasPrismaCode(error, 'P2002')) throw error;
      const replay = await this.prisma.client.inventoryImportJob.findUnique({
        where: {
          tenantId_stageIdempotencyKey: {
            tenantId: actor.tenantId,
            stageIdempotencyKey: dto.stageIdempotencyKey,
          },
        },
        include: { rows: { orderBy: { rowNumber: 'asc' } } },
      });
      if (!replay || replay.stageCommandHash !== stageCommandHash) {
        throw new ConflictException('Import staging conflicts with an existing command');
      }
      return this.toPreview(replay, true);
    }
  }

  async getPreview(actor: TrustedInventoryActor, providerId: string, importJobId: string) {
    await this.assertAssignedPharmacy(this.prisma.client, actor, providerId);
    const job = await this.prisma.client.inventoryImportJob.findFirst({
      where: { id: importJobId, tenantId: actor.tenantId, providerId },
      include: {
        rows: { orderBy: { rowNumber: 'asc' } },
        receipt: true,
      },
    });
    if (!job) throw new NotFoundException('Inventory import not found');
    return this.toPreview(job, false);
  }

  async apply(
    actor: TrustedInventoryActor,
    providerId: string,
    importJobId: string,
    dto: ApplyInventoryImportDto,
    request?: Parameters<AuditWriter['appendTenantUser']>[1]['request'],
  ) {
    this.validateIdempotencyKey(dto.idempotencyKey);

    return withSerializableRetry(this.prisma.client, async (transaction) => {
      await this.assertAssignedPharmacy(transaction, actor, providerId);
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "InventoryImportJob"
          WHERE "id" = ${importJobId}::uuid
            AND "tenantId" = ${actor.tenantId}::uuid
            AND "providerId" = ${providerId}::uuid
          FOR UPDATE`,
      );

      const job = await transaction.inventoryImportJob.findFirst({
        where: { id: importJobId, tenantId: actor.tenantId, providerId },
        include: {
          rows: { orderBy: { rowNumber: 'asc' } },
          receipt: true,
        },
      });
      if (!job) throw new NotFoundException('Inventory import not found');

      const applyCommandHash = this.hash({
        tenantId: actor.tenantId,
        providerId,
        importJobId,
        stageCommandHash: job.stageCommandHash,
      });

      if (job.status === 'APPLIED') {
        if (
          job.applyIdempotencyKey !== dto.idempotencyKey ||
          job.applyCommandHash !== applyCommandHash ||
          !job.receipt
        ) {
          throw new ConflictException('Inventory import has already been applied');
        }
        return {
          receiptId: job.receipt.id,
          appliedRowCount: job.receipt.appliedRowCount,
          totalQuantity: job.receipt.totalQuantity,
          replayed: true,
        };
      }
      if (job.invalidRowCount !== 0 || job.validRowCount !== job.rowCount) {
        throw new ConflictException('Inventory import contains invalid rows');
      }
      if (job.rows.length !== job.rowCount || job.rows.some((row) => row.status !== 'VALID')) {
        throw new ConflictException('Inventory import staging evidence is incomplete');
      }

      const parsedRows = job.rows.map((row) => ({
        id: row.id,
        rowNumber: row.rowNumber,
        productId: row.productId,
        payload: this.readPayload(row.payload),
      }));
      if (parsedRows.some((row) => !row.productId)) {
        throw new ConflictException('Inventory import contains unresolved products');
      }

      const [{ occurredAt }] = await transaction.$queryRaw<Array<{ occurredAt: Date }>>(
        Prisma.sql`SELECT CURRENT_TIMESTAMP AS "occurredAt"`,
      );
      if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
        throw new Error('Database timestamp was not returned');
      }

      const byProduct = new Map<string, typeof parsedRows>();
      for (const row of parsedRows) {
        const productId = row.productId as string;
        const list = byProduct.get(productId) ?? [];
        list.push(row);
        byProduct.set(productId, list);
      }

      const inventoryIds = new Map<string, string>();
      for (const [productId, productRows] of byProduct) {
        const first = productRows[0].payload;
        const product = await transaction.product.findFirst({
          where: { id: productId, isActive: true, deletedAt: null },
          select: { id: true },
        });
        if (!product) throw new ConflictException('An imported product is no longer active');

        const existing = await transaction.inventory.findUnique({
          where: {
            tenantId_providerId_productId: {
              tenantId: actor.tenantId,
              providerId,
              productId,
            },
          },
          select: { id: true, version: true, deletedAt: true },
        });

        if (first.expectedInventoryVersion === null) {
          if (existing) {
            throw new ConflictException('Inventory changed after import preview');
          }
        } else if (
          !existing ||
          existing.deletedAt ||
          existing.version !== first.expectedInventoryVersion
        ) {
          throw new ConflictException('Inventory changed after import preview');
        }

        const listingData = {
          sku: first.sku ?? undefined,
          sellingPrice: new Prisma.Decimal(first.sellingPrice),
          mrp: new Prisma.Decimal(first.mrp),
          discountPercentage: new Prisma.Decimal(first.discountPercentage),
          taxPercentage: new Prisma.Decimal(first.taxPercentage),
          minimumStockLevel: first.minimumStockLevel,
          isVisible: first.isVisible,
        };
        let inventoryId: string;
        let resultingVersion: number;

        if (!existing) {
          inventoryId = randomUUID();
          resultingVersion = 1;
          await transaction.inventory.create({
            data: {
              id: inventoryId,
              tenantId: actor.tenantId,
              providerId,
              productId,
              ...listingData,
            },
            select: { id: true },
          });
        } else {
          inventoryId = existing.id;
          resultingVersion = existing.version + 1;
          const updated = await transaction.inventory.updateMany({
            where: {
              id: existing.id,
              tenantId: actor.tenantId,
              version: existing.version,
              deletedAt: null,
            },
            data: { ...listingData, version: { increment: 1 } },
          });
          if (updated.count !== 1) {
            throw new SerializableRetryError('Concurrent import inventory update detected');
          }
        }
        inventoryIds.set(productId, inventoryId);

        const configurationKey = `import:${job.id}:${productId}:configuration`;
        const configurationHash = this.hash({
          tenantId: actor.tenantId,
          providerId,
          productId,
          expectedVersion: first.expectedInventoryVersion,
          sku: first.sku,
          sellingPrice: first.sellingPrice,
          mrp: first.mrp,
          discountPercentage: first.discountPercentage,
          taxPercentage: first.taxPercentage,
          minimumStockLevel: first.minimumStockLevel,
          isVisible: first.isVisible,
        });
        await transaction.inventoryConfigurationCommand.create({
          data: {
            id: randomUUID(),
            tenantId: actor.tenantId,
            inventoryId,
            idempotencyKey: configurationKey,
            configurationHash,
            resultingVersion,
          },
          select: { id: true },
        });
        await this.audit.appendTenantUser(transaction, {
          tenantId: actor.tenantId,
          actorMembershipId: actor.membershipId,
          actorUserId: actor.userId,
          eventType: 'inventory.listing.configured',
          outcome: 'SUCCEEDED',
          resourceType: 'Inventory',
          resourceId: inventoryId,
          metadata: { productId, version: resultingVersion },
          request,
        });
      }

      let totalQuantity = 0;
      for (const row of parsedRows) {
        const productId = row.productId as string;
        const payload = row.payload;
        const inventoryId = inventoryIds.get(productId);
        if (!inventoryId) throw new Error('Inventory import listing resolution failed');

        const duplicate = await transaction.batch.findUnique({
          where: {
            tenantId_providerId_productId_batchNumber: {
              tenantId: actor.tenantId,
              providerId,
              productId,
              batchNumber: payload.batchNumber,
            },
          },
          select: { id: true },
        });
        if (duplicate) throw new ConflictException('Batch changed after import preview');

        const batchId = randomUUID();
        const movementId = randomUUID();
        const receiveKey = `import:${job.id}:${row.rowNumber}:receive`;
        const manufacturingDate = payload.manufacturingDate
          ? new Date(payload.manufacturingDate)
          : undefined;
        const expiryDate = new Date(payload.expiryDate);
        const commandHash = this.hash({
          tenantId: actor.tenantId,
          providerId,
          productId,
          batchNumber: payload.batchNumber,
          manufacturingDate: manufacturingDate?.toISOString() ?? null,
          expiryDate: expiryDate.toISOString(),
          quantity: payload.quantity,
          purchasePrice: payload.purchasePrice,
          sellingPrice: payload.sellingPrice,
          reason: 'inventory-import',
        });

        await transaction.batch.create({
          data: {
            id: batchId,
            tenantId: actor.tenantId,
            inventoryId,
            providerId,
            productId,
            batchNumber: payload.batchNumber,
            manufacturingDate,
            expiryDate,
            receivedQuantity: payload.quantity,
            onHandQuantity: payload.quantity,
            heldQuantity: 0,
            purchasePrice: new Prisma.Decimal(payload.purchasePrice),
            sellingPrice: new Prisma.Decimal(payload.sellingPrice),
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        await transaction.stockMovement.create({
          data: {
            id: movementId,
            tenantId: actor.tenantId,
            inventoryId,
            batchId,
            providerId,
            productId,
            type: 'STOCK_IN',
            delta: payload.quantity,
            onHandBefore: 0,
            onHandAfter: payload.quantity,
            referenceType: 'inventory.batch.receive',
            referenceId: batchId,
            reason: 'inventory-import',
            idempotencyKey: receiveKey,
            commandHash,
            actorType: 'TENANT_USER',
            actorMembershipId: actor.membershipId,
            occurredAt,
          },
          select: { id: true },
        });
        await this.evidence.recordObservation(transaction, {
          tenantId: actor.tenantId,
          inventoryId,
          batchId,
          providerId,
          productId,
          source: 'AIM_MANAGED_INVENTORY',
          observedOnHandQuantity: payload.quantity,
          occurredAt,
          movementId,
          idempotencyKey: receiveKey,
        });
        await this.audit.appendTenantUser(transaction, {
          tenantId: actor.tenantId,
          actorMembershipId: actor.membershipId,
          actorUserId: actor.userId,
          eventType: 'inventory.batch.received',
          outcome: 'SUCCEEDED',
          resourceType: 'Batch',
          resourceId: batchId,
          metadata: { productId, quantity: payload.quantity },
          request,
        });
        await transaction.inventoryImportRow.update({
          where: { id: row.id },
          data: {
            status: 'APPLIED',
            inventoryId,
            batchId,
            appliedAt: occurredAt,
          },
          select: { id: true },
        });
        totalQuantity += payload.quantity;
      }

      const jobUpdated = await transaction.inventoryImportJob.updateMany({
        where: {
          id: job.id,
          tenantId: actor.tenantId,
          providerId,
          status: 'STAGED',
          appliedAt: null,
        },
        data: {
          status: 'APPLIED',
          appliedByMembershipId: actor.membershipId,
          applyIdempotencyKey: dto.idempotencyKey,
          applyCommandHash,
          appliedAt: occurredAt,
        },
      });
      if (jobUpdated.count !== 1) {
        throw new SerializableRetryError('Concurrent inventory import apply detected');
      }

      const receiptId = randomUUID();
      await transaction.inventoryImportReceipt.create({
        data: {
          id: receiptId,
          importJobId: job.id,
          tenantId: actor.tenantId,
          providerId,
          actorMembershipId: actor.membershipId,
          appliedRowCount: job.rowCount,
          totalQuantity,
        },
        select: { id: true },
      });
      await this.audit.appendTenantUser(transaction, {
        tenantId: actor.tenantId,
        actorMembershipId: actor.membershipId,
        actorUserId: actor.userId,
        eventType: 'inventory.import.applied',
        outcome: 'SUCCEEDED',
        resourceType: 'InventoryImportJob',
        resourceId: job.id,
        metadata: { providerId, rowCount: job.rowCount, totalQuantity },
        request,
      });

      return {
        receiptId,
        appliedRowCount: job.rowCount,
        totalQuantity,
        replayed: false,
      };
    });
  }

  private async normalizeRow(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    providerId: string,
    row: InventoryImportStageRowDto,
  ): Promise<MutableStagedRow> {
    const errors: string[] = [];
    const productId = await this.resolveProduct(transaction, row, errors);

    const sellingPrice = this.decimal(row.sellingPrice, 'SELLING_PRICE', errors);
    const mrp = this.decimal(row.mrp, 'MRP', errors);
    const purchasePrice = this.decimal(row.purchasePrice, 'PURCHASE_PRICE', errors);
    const discountPercentage = this.percentage(
      row.discountPercentage ?? '0',
      'DISCOUNT_PERCENTAGE',
      errors,
    );
    const taxPercentage = this.percentage(row.taxPercentage ?? '0', 'TAX_PERCENTAGE', errors);
    const minimumStockLevel = this.nonNegativeInteger(
      row.minimumStockLevel ?? '0',
      'MINIMUM_STOCK_LEVEL',
      errors,
    );
    const quantity = this.positiveInteger(row.quantity, 'QUANTITY', errors);
    const isVisible = this.booleanValue(row.isVisible ?? 'true', errors);
    const batchNumber = row.batchNumber?.trim() ?? '';
    if (!batchNumber || batchNumber.length > 120) errors.push('BATCH_NUMBER_INVALID');

    const expiryDate = this.dateValue(row.expiryDate, 'EXPIRY_DATE', errors);
    const manufacturingDate = row.manufacturingDate
      ? this.dateValue(row.manufacturingDate, 'MANUFACTURING_DATE', errors)
      : null;
    if (expiryDate && expiryDate.getTime() <= Date.now()) errors.push('EXPIRY_DATE_NOT_FUTURE');
    if (
      manufacturingDate &&
      (manufacturingDate.getTime() > Date.now() ||
        (expiryDate && manufacturingDate.getTime() >= expiryDate.getTime()))
    ) {
      errors.push('MANUFACTURING_DATE_INVALID');
    }

    let expectedInventoryVersion: number | null = null;
    if (productId) {
      const listing = await transaction.inventory.findUnique({
        where: { tenantId_providerId_productId: { tenantId, providerId, productId } },
        select: { version: true, deletedAt: true },
      });
      if (listing?.deletedAt) errors.push('INVENTORY_LISTING_DELETED');
      expectedInventoryVersion = listing?.deletedAt ? null : (listing?.version ?? null);

      if (batchNumber) {
        const duplicate = await transaction.batch.findUnique({
          where: {
            tenantId_providerId_productId_batchNumber: {
              tenantId,
              providerId,
              productId,
              batchNumber,
            },
          },
          select: { id: true },
        });
        if (duplicate) errors.push('BATCH_ALREADY_EXISTS');
      }
    }

    return {
      id: randomUUID(),
      rowNumber: row.rowNumber,
      productId,
      errors: [...new Set(errors)],
      payload: {
        sku: row.sku?.trim() || null,
        sellingPrice: sellingPrice ?? '0',
        mrp: mrp ?? '0',
        discountPercentage: discountPercentage ?? '0',
        taxPercentage: taxPercentage ?? '0',
        minimumStockLevel: minimumStockLevel ?? 0,
        isVisible: isVisible ?? true,
        batchNumber,
        manufacturingDate: manufacturingDate?.toISOString() ?? null,
        expiryDate: expiryDate?.toISOString() ?? new Date(0).toISOString(),
        quantity: quantity ?? 0,
        purchasePrice: purchasePrice ?? '0',
        expectedInventoryVersion,
      },
    };
  }

  private async resolveProduct(
    transaction: Prisma.TransactionClient,
    row: InventoryImportStageRowDto,
    errors: string[],
  ): Promise<string | null> {
    const resolved: string[] = [];
    let referenceCount = 0;

    if (row.productId) {
      referenceCount += 1;
      const product = await transaction.product.findFirst({
        where: { id: row.productId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!product) errors.push('PRODUCT_ID_NOT_FOUND');
      else resolved.push(product.id);
    }

    if (row.identifier?.trim()) {
      referenceCount += 1;
      const canonical = normalizeProductIdentifier(row.identifier);
      if (!canonical) {
        errors.push('IDENTIFIER_INVALID');
      } else {
        const products = await transaction.product.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            OR: [
              { identifiers: { some: { normalizedValue: canonical.normalizedValue } } },
              { barcode: { in: equivalentLegacyBarcodeValues(canonical) } },
            ],
          },
          select: { id: true },
          take: 2,
        });
        if (products.length === 0) errors.push('IDENTIFIER_NOT_FOUND');
        else if (products.length > 1) errors.push('IDENTIFIER_AMBIGUOUS');
        else resolved.push(products[0].id);
      }
    }

    if (row.productName?.trim()) {
      referenceCount += 1;
      const products = await transaction.product.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          name: { equals: row.productName.trim(), mode: 'insensitive' },
          ...(row.brand?.trim()
            ? { brand: { equals: row.brand.trim(), mode: 'insensitive' } }
            : {}),
          ...(row.manufacturer?.trim()
            ? { manufacturer: { equals: row.manufacturer.trim(), mode: 'insensitive' } }
            : {}),
          ...(row.strength?.trim()
            ? { strength: { equals: row.strength.trim(), mode: 'insensitive' } }
            : {}),
        },
        select: { id: true, dosageForm: true },
        take: 3,
      });
      const filtered = row.dosageForm?.trim()
        ? products.filter(
            (product) => product.dosageForm.toLowerCase() === row.dosageForm?.trim().toLowerCase(),
          )
        : products;
      if (filtered.length === 0) errors.push('PRODUCT_EXACT_MATCH_NOT_FOUND');
      else if (filtered.length > 1) errors.push('PRODUCT_EXACT_MATCH_AMBIGUOUS');
      else resolved.push(filtered[0].id);
    } else if (
      row.brand?.trim() ||
      row.manufacturer?.trim() ||
      row.strength?.trim() ||
      row.dosageForm?.trim()
    ) {
      errors.push('PRODUCT_NAME_REQUIRED_FOR_MANUAL_MATCH');
    }

    if (referenceCount === 0) {
      errors.push('PRODUCT_REFERENCE_REQUIRED');
      return null;
    }
    const unique = [...new Set(resolved)];
    if (unique.length > 1) {
      errors.push('PRODUCT_REFERENCE_CONFLICT');
      return null;
    }
    return unique[0] ?? null;
  }

  private markIntraFileConflicts(rows: MutableStagedRow[]): void {
    const signatures = new Map<string, Set<string>>();
    const batchRows = new Map<string, MutableStagedRow[]>();

    for (const row of rows) {
      if (!row.productId) continue;
      const signature = JSON.stringify({
        sku: row.payload.sku,
        sellingPrice: row.payload.sellingPrice,
        mrp: row.payload.mrp,
        discountPercentage: row.payload.discountPercentage,
        taxPercentage: row.payload.taxPercentage,
        minimumStockLevel: row.payload.minimumStockLevel,
        isVisible: row.payload.isVisible,
        expectedInventoryVersion: row.payload.expectedInventoryVersion,
      });
      const productSignatures = signatures.get(row.productId) ?? new Set<string>();
      productSignatures.add(signature);
      signatures.set(row.productId, productSignatures);

      if (row.payload.batchNumber) {
        const key = `${row.productId}\u0000${row.payload.batchNumber}`;
        const list = batchRows.get(key) ?? [];
        list.push(row);
        batchRows.set(key, list);
      }
    }

    for (const row of rows) {
      if (row.productId && (signatures.get(row.productId)?.size ?? 0) > 1) {
        row.errors.push('CONFLICTING_PRODUCT_CONFIGURATION');
      }
    }
    for (const list of batchRows.values()) {
      if (list.length > 1) {
        for (const row of list) row.errors.push('DUPLICATE_BATCH_IN_IMPORT');
      }
    }
    for (const row of rows) row.errors = [...new Set(row.errors)];
  }

  private readPayload(value: Prisma.JsonValue): StagedPayload {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new ConflictException('Inventory import row payload is invalid');
    }
    const payload = value as Record<string, Prisma.JsonValue>;
    const requiredStrings = [
      'sellingPrice',
      'mrp',
      'discountPercentage',
      'taxPercentage',
      'batchNumber',
      'expiryDate',
      'purchasePrice',
    ] as const;
    for (const key of requiredStrings) {
      if (typeof payload[key] !== 'string') {
        throw new ConflictException('Inventory import row payload is invalid');
      }
    }
    if (
      typeof payload.minimumStockLevel !== 'number' ||
      typeof payload.isVisible !== 'boolean' ||
      typeof payload.quantity !== 'number' ||
      !(
        payload.expectedInventoryVersion === null ||
        typeof payload.expectedInventoryVersion === 'number'
      )
    ) {
      throw new ConflictException('Inventory import row payload is invalid');
    }
    return {
      sku: typeof payload.sku === 'string' ? payload.sku : null,
      sellingPrice: payload.sellingPrice as string,
      mrp: payload.mrp as string,
      discountPercentage: payload.discountPercentage as string,
      taxPercentage: payload.taxPercentage as string,
      minimumStockLevel: payload.minimumStockLevel,
      isVisible: payload.isVisible,
      batchNumber: payload.batchNumber as string,
      manufacturingDate:
        typeof payload.manufacturingDate === 'string' ? payload.manufacturingDate : null,
      expiryDate: payload.expiryDate as string,
      quantity: payload.quantity,
      purchasePrice: payload.purchasePrice as string,
      expectedInventoryVersion: payload.expectedInventoryVersion,
    };
  }

  private toPreview(
    job: {
      id: string;
      providerId: string;
      sourceFormat: string;
      sourceFileName: string;
      status: string;
      rowCount: number;
      validRowCount: number;
      invalidRowCount: number;
      createdAt: Date;
      appliedAt: Date | null;
      rows: Array<{
        id: string;
        rowNumber: number;
        productId: string | null;
        payload: Prisma.JsonValue;
        validationErrors: Prisma.JsonValue;
        status: string;
        inventoryId: string | null;
        batchId: string | null;
      }>;
      receipt?: { id: string; appliedRowCount: number; totalQuantity: number } | null;
    },
    replayed: boolean,
  ) {
    return {
      importJobId: job.id,
      providerId: job.providerId,
      sourceFormat: job.sourceFormat,
      sourceFileName: job.sourceFileName,
      status: job.status,
      rowCount: job.rowCount,
      validRowCount: job.validRowCount,
      invalidRowCount: job.invalidRowCount,
      createdAt: job.createdAt.toISOString(),
      appliedAt: job.appliedAt?.toISOString() ?? null,
      replayed,
      receipt: job.receipt
        ? {
            id: job.receipt.id,
            appliedRowCount: job.receipt.appliedRowCount,
            totalQuantity: job.receipt.totalQuantity,
          }
        : null,
      rows: job.rows.map((row) => ({
        rowId: row.id,
        rowNumber: row.rowNumber,
        productId: row.productId,
        payload: row.payload,
        validationErrors: row.validationErrors,
        status: row.status,
        inventoryId: row.inventoryId,
        batchId: row.batchId,
      })),
    };
  }

  private validateMapping(mapping: Record<string, string>): void {
    const entries = Object.entries(mapping);
    if (entries.length === 0 || entries.length > 32) {
      throw new BadRequestException('Import mapping must contain 1 to 32 fields');
    }
    const usedTargets = new Set<string>();
    for (const [header, target] of entries) {
      if (!header.trim() || header.length > 120 || !IMPORT_MAPPING_FIELDS.has(target)) {
        throw new BadRequestException('Import mapping contains an unsupported field');
      }
      if (usedTargets.has(target)) {
        throw new BadRequestException('Import mapping cannot map multiple columns to one field');
      }
      usedTargets.add(target);
    }
  }

  private decimal(value: string | undefined, code: string, errors: string[]): string | null {
    if (!value?.trim()) {
      errors.push(`${code}_REQUIRED`);
      return null;
    }
    try {
      const parsed = new Prisma.Decimal(value.trim());
      if (parsed.isNegative() || parsed.greaterThan(new Prisma.Decimal('99999999.99'))) {
        errors.push(`${code}_INVALID`);
        return null;
      }
      return parsed.toFixed(2);
    } catch {
      errors.push(`${code}_INVALID`);
      return null;
    }
  }

  private percentage(value: string, code: string, errors: string[]): string | null {
    try {
      const parsed = new Prisma.Decimal(value.trim());
      if (parsed.isNegative() || parsed.greaterThan(100)) {
        errors.push(`${code}_INVALID`);
        return null;
      }
      return parsed.toFixed(2);
    } catch {
      errors.push(`${code}_INVALID`);
      return null;
    }
  }

  private positiveInteger(
    value: string | undefined,
    code: string,
    errors: string[],
  ): number | null {
    if (!value?.trim() || !/^[1-9]\d*$/.test(value.trim())) {
      errors.push(`${code}_INVALID`);
      return null;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      errors.push(`${code}_INVALID`);
      return null;
    }
    return parsed;
  }

  private nonNegativeInteger(value: string, code: string, errors: string[]): number | null {
    if (!/^(?:0|[1-9]\d*)$/.test(value.trim())) {
      errors.push(`${code}_INVALID`);
      return null;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      errors.push(`${code}_INVALID`);
      return null;
    }
    return parsed;
  }

  private booleanValue(value: string, errors: string[]): boolean | null {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    errors.push('IS_VISIBLE_INVALID');
    return null;
  }

  private dateValue(value: string | undefined, code: string, errors: string[]): Date | null {
    if (!value?.trim()) {
      errors.push(`${code}_REQUIRED`);
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      errors.push(`${code}_INVALID`);
      return null;
    }
    return date;
  }

  private rowHashInput(row: InventoryImportStageRowDto) {
    return {
      rowNumber: row.rowNumber,
      productId: row.productId ?? null,
      identifier: row.identifier?.trim() ?? null,
      productName: row.productName?.trim() ?? null,
      brand: row.brand?.trim() ?? null,
      manufacturer: row.manufacturer?.trim() ?? null,
      strength: row.strength?.trim() ?? null,
      dosageForm: row.dosageForm?.trim() ?? null,
      sku: row.sku?.trim() ?? null,
      sellingPrice: row.sellingPrice?.trim() ?? null,
      mrp: row.mrp?.trim() ?? null,
      discountPercentage: row.discountPercentage?.trim() ?? null,
      taxPercentage: row.taxPercentage?.trim() ?? null,
      minimumStockLevel: row.minimumStockLevel?.trim() ?? null,
      isVisible: row.isVisible?.trim() ?? null,
      batchNumber: row.batchNumber?.trim() ?? null,
      manufacturingDate: row.manufacturingDate?.trim() ?? null,
      expiryDate: row.expiryDate?.trim() ?? null,
      quantity: row.quantity?.trim() ?? null,
      purchasePrice: row.purchasePrice?.trim() ?? null,
    };
  }

  private async assertAssignedPharmacy(
    database: Prisma.TransactionClient | PrismaService['client'],
    actor: TrustedInventoryActor,
    providerId: string,
  ): Promise<void> {
    await assertTrustedProviderAccess(database, actor, providerId);
    const provider = await database.provider.findFirst({
      where: {
        id: providerId,
        tenantId: actor.tenantId,
        providerType: 'PHARMACY',
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!provider) throw new NotFoundException('Provider inventory not found');
  }

  private validateIdempotencyKey(value: string): void {
    if (!value || value.length > 120 || value !== value.trim()) {
      throw new BadRequestException('Idempotency key must contain 1 to 120 trimmed characters');
    }
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
