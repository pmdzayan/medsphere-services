import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { StockLedgerRepository } from './stock-ledger.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateLocationDto } from './dto/create-location.dto';
import { CreateStockBatchDto } from './dto/create-stock-batch.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { TransactionType, ReservationStatusV2 } from './enums';

@Injectable()
export class StockLedgerService {
  constructor(private readonly repository: StockLedgerRepository) {}

  // ---- Product Catalog ----

  async createProduct(dto: CreateProductDto) {
    const existing = await this.repository.findProductByTenantSku(dto.tenantId, dto.sku);
    if (existing) {
      throw new ConflictException(`Product with SKU "${dto.sku}" already exists in this tenant`);
    }
    return this.repository.createProduct({
      tenantId: dto.tenantId,
      sku: dto.sku,
      name: dto.name,
      genericName: dto.genericName,
      description: dto.description,
      category: dto.category,
      unitOfMeasure: dto.unitOfMeasure,
      isControlled: dto.isControlled ?? false,
      requiresColdChain: dto.requiresColdChain ?? false,
      minStockThreshold: dto.minStockThreshold ?? 0,
    });
  }

  async findProductById(id: string) {
    const product = await this.repository.findProductById(id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findProductsByTenant(tenantId: string) {
    return this.repository.findProductsByTenant(tenantId);
  }

  // ---- Locations ----

  async createLocation(dto: CreateLocationDto) {
    const existing = await this.repository.findLocationByTenantName(dto.tenantId, dto.name);
    if (existing) {
      throw new ConflictException(`Location "${dto.name}" already exists in this tenant`);
    }
    return this.repository.createLocation({
      tenantId: dto.tenantId,
      name: dto.name,
      type: dto.type,
      isStorage: dto.isStorage ?? true,
    });
  }

  async findLocationById(id: string) {
    const location = await this.repository.findLocationById(id);
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async findLocationsByTenant(tenantId: string) {
    return this.repository.findLocationsByTenant(tenantId);
  }

  // ---- Stock Batches ----

  async createStockBatch(dto: CreateStockBatchDto) {
    const product = await this.repository.findProductById(dto.productId);
    if (!product) throw new NotFoundException('Product not found');

    const existing = await this.repository.findStockBatchesByProduct(dto.tenantId, dto.productId);
    const duplicate = existing.find((b) => b.batchNumber === dto.batchNumber);
    if (duplicate) {
      throw new ConflictException(`Batch "${dto.batchNumber}" already exists for this product`);
    }

    const expiryDate = new Date(dto.expiryDate);
    if (isNaN(expiryDate.getTime())) {
      throw new BadRequestException('Invalid expiry date');
    }

    return this.repository.createStockBatch({
      tenantId: dto.tenantId,
      productId: dto.productId,
      batchNumber: dto.batchNumber,
      manufacturedDate: dto.manufacturedDate ? new Date(dto.manufacturedDate) : undefined,
      expiryDate,
      unitCost: dto.unitCost,
      sellingPrice: dto.sellingPrice,
      initialQuantity: dto.initialQuantity,
      currentQuantity: dto.initialQuantity,
    });
  }

  async findStockBatchById(id: string) {
    const batch = await this.repository.findStockBatchById(id);
    if (!batch) throw new NotFoundException('Stock batch not found');
    return batch;
  }

  async findStockBatchesByProduct(tenantId: string, productId: string) {
    return this.repository.findStockBatchesByProduct(tenantId, productId);
  }

  async previewFefoAllocation(tenantId: string, productId: string, quantity?: number) {
    return this.repository.findFefoBatches(tenantId, productId, quantity);
  }

  // ---- Stock Ledger Transactions ----

  async createTransaction(dto: CreateTransactionDto) {
    // Validate batch exists and has sufficient quantity for outgoing transactions
    const batch = await this.repository.findStockBatchById(dto.batchId);
    if (!batch) throw new NotFoundException('Stock batch not found');

    // Validate source location
    const sourceLocation = await this.repository.findLocationById(dto.sourceLocationId);
    if (!sourceLocation) throw new NotFoundException('Source location not found');

    // Validate target location
    const targetLocation = await this.repository.findLocationById(dto.targetLocationId);
    if (!targetLocation) throw new NotFoundException('Target location not found');

    // For outgoing transactions, check sufficient quantity
    const isOutgoing = [
      TransactionType.TRANSFER,
      TransactionType.DISPENSE,
      TransactionType.ADJUSTMENT_SUB,
      TransactionType.EXPIRED_DISCARD,
    ].includes(dto.transactionType);

    if (isOutgoing && batch.currentQuantity < dto.quantity) {
      throw new BadRequestException(
        `Insufficient batch quantity. Available: ${batch.currentQuantity}, requested: ${dto.quantity}`,
      );
    }

    // Create the immutable ledger entry
    const transaction = await this.repository.createTransaction({
      tenantId: dto.tenantId,
      transactionType: dto.transactionType,
      productId: dto.productId,
      batchId: dto.batchId,
      sourceLocationId: dto.sourceLocationId,
      targetLocationId: dto.targetLocationId,
      quantity: dto.quantity,
      referenceType: dto.referenceType,
      referenceId: dto.referenceId,
      correlationId: dto.correlationId,
    });

    // Update batch quantity
    const quantityDelta = isOutgoing ? -dto.quantity : dto.quantity;
    const newQuantity = Math.max(0, batch.currentQuantity + quantityDelta);
    await this.repository.updateStockBatchQuantity(dto.batchId, newQuantity);

    return transaction;
  }

  async findTransactionsByTenant(
    tenantId: string,
    params: {
      productId?: string;
      batchId?: string;
      transactionType?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    return this.repository.findTransactionsByTenant(tenantId, params);
  }

  // ---- Stock Reservations ----

  async createReservation(dto: CreateReservationDto) {
    // Validate batch has sufficient quantity
    const batch = await this.repository.findStockBatchById(dto.batchId);
    if (!batch) throw new NotFoundException('Stock batch not found');

    // Check existing active reservations for this location/product
    const activeReservations = await this.repository.findActiveReservationsByLocation(
      dto.tenantId,
      dto.locationId,
      dto.productId,
    );
    const totalReserved = activeReservations.reduce((sum, r) => sum + r.quantity, 0);
    const availableForReservation = batch.currentQuantity - totalReserved;

    if (availableForReservation < dto.quantity) {
      throw new BadRequestException(
        `Insufficient available stock for reservation. Available: ${availableForReservation}, requested: ${dto.quantity}`,
      );
    }

    return this.repository.createReservation({
      tenantId: dto.tenantId,
      locationId: dto.locationId,
      productId: dto.productId,
      batchId: dto.batchId,
      quantity: dto.quantity,
      expiresAt: new Date(dto.expiresAt),
      referenceId: dto.referenceId,
    });
  }

  async fulfillReservation(reservationId: string) {
    const reservation = await this.repository.findReservationById(reservationId);
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.status !== ReservationStatusV2.ACTIVE) {
      throw new BadRequestException(`Cannot fulfill reservation in status: ${reservation.status}`);
    }
    return this.repository.updateReservationStatus(reservationId, ReservationStatusV2.FULFILLED);
  }

  async cancelReservation(reservationId: string) {
    const reservation = await this.repository.findReservationById(reservationId);
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.status !== ReservationStatusV2.ACTIVE) {
      throw new BadRequestException(`Cannot cancel reservation in status: ${reservation.status}`);
    }
    return this.repository.updateReservationStatus(reservationId, ReservationStatusV2.CANCELLED);
  }

  async expireReservations(): Promise<number> {
    // Find and expire all reservations past their expiry
    // This is a simplified version - a production implementation would batch this
    return 0;
  }
}
