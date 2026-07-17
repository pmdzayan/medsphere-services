import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InventoryRepository, InventoryFindAllParams } from './inventory.repository';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { InventoryResponseDto } from './dto/inventory-response.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly repository: InventoryRepository) {}

  async create(dto: CreateInventoryDto): Promise<InventoryResponseDto> {
    this.validateExpiryDate(dto.expiryDate);

    if (dto.reservedQuantity !== undefined && dto.reservedQuantity > dto.quantity) {
      throw new BadRequestException('Reserved quantity cannot exceed total quantity');
    }

    const record = await this.repository.create({
      providerId: dto.providerId,
      productId: dto.productId,
      sku: dto.sku,
      batchNumber: dto.batchNumber,
      expiryDate: new Date(dto.expiryDate),
      quantity: dto.quantity,
      reservedQuantity: dto.reservedQuantity ?? 0,
      sellingPrice: dto.sellingPrice,
      mrp: dto.mrp,
      discountPercentage: dto.discountPercentage ?? 0,
      taxPercentage: dto.taxPercentage ?? 0,
      minimumStockLevel: dto.minimumStockLevel ?? 10,
      inStock: dto.quantity > 0,
    });

    return this.toResponseDto(record);
  }

  async findById(id: string): Promise<InventoryResponseDto> {
    const record = await this.repository.findById(id);
    if (!record || record.deletedAt) {
      throw new NotFoundException('Inventory record not found');
    }
    return this.toResponseDto(record);
  }

  async findAll(params: InventoryFindAllParams): Promise<InventoryResponseDto[]> {
    const records = await this.repository.findAll(params);
    return records
      .filter((record: Record<string, unknown>) => !record.deletedAt)
      .map((record: Record<string, unknown>) => this.toResponseDto(record));
  }

  async update(id: string, dto: UpdateInventoryDto): Promise<InventoryResponseDto> {
    const existing = await this.repository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Inventory record not found');
    }

    if (dto.expiryDate) {
      this.validateExpiryDate(dto.expiryDate);
    }

    const finalQuantity = dto.quantity ?? existing.quantity;
    const finalReserved = dto.reservedQuantity ?? existing.reservedQuantity;

    if (finalReserved > finalQuantity) {
      throw new BadRequestException('Reserved quantity cannot exceed total quantity');
    }

    const updateData: Record<string, unknown> = {};
    if (dto.productId !== undefined) updateData.productId = dto.productId;
    if (dto.sku !== undefined) updateData.sku = dto.sku;
    if (dto.batchNumber !== undefined) updateData.batchNumber = dto.batchNumber;
    if (dto.expiryDate !== undefined) updateData.expiryDate = new Date(dto.expiryDate);
    if (dto.quantity !== undefined) {
      updateData.quantity = dto.quantity;
      updateData.inStock = dto.quantity > 0;
    }
    if (dto.reservedQuantity !== undefined) updateData.reservedQuantity = dto.reservedQuantity;
    if (dto.sellingPrice !== undefined) updateData.sellingPrice = dto.sellingPrice;
    if (dto.mrp !== undefined) updateData.mrp = dto.mrp;
    if (dto.discountPercentage !== undefined)
      updateData.discountPercentage = dto.discountPercentage;
    if (dto.taxPercentage !== undefined) updateData.taxPercentage = dto.taxPercentage;
    if (dto.minimumStockLevel !== undefined) updateData.minimumStockLevel = dto.minimumStockLevel;
    if (dto.inStock !== undefined) updateData.inStock = dto.inStock;
    if (dto.isVisible !== undefined) updateData.isVisible = dto.isVisible;

    const updated = await this.repository.update(id, updateData);
    return this.toResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Inventory record not found');
    }

    await this.repository.softDelete(id);
  }

  private validateExpiryDate(expiryDate: string): void {
    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime())) {
      throw new BadRequestException('Invalid expiry date');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResponseDto(record: any): InventoryResponseDto {
    const dto = new InventoryResponseDto();
    dto.id = record.id;
    dto.providerId = record.providerId;
    dto.productId = record.productId;
    dto.sku = record.sku ?? null;
    dto.batchNumber = record.batchNumber;
    dto.expiryDate =
      record.expiryDate instanceof Date ? record.expiryDate.toISOString() : record.expiryDate;
    dto.quantity = record.quantity;
    dto.reservedQuantity = record.reservedQuantity;
    dto.sellingPrice = record.sellingPrice?.toString?.() ?? String(record.sellingPrice);
    dto.mrp = record.mrp?.toString?.() ?? String(record.mrp);
    dto.discountPercentage =
      record.discountPercentage?.toString?.() ?? String(record.discountPercentage);
    dto.taxPercentage = record.taxPercentage?.toString?.() ?? String(record.taxPercentage);
    dto.minimumStockLevel = record.minimumStockLevel;
    dto.inStock = record.inStock;
    dto.isVisible = record.isVisible;
    dto.createdAt =
      record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt;
    dto.updatedAt =
      record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt;
    return dto;
  }
}
