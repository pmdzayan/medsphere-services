import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { BatchRepository } from './batch.repository';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { BatchResponseDto } from './dto/batch-response.dto';
import { BatchStatus } from '../common/enums';

@Injectable()
export class BatchService {
  constructor(private readonly repository: BatchRepository) {}

  async create(dto: CreateBatchDto): Promise<BatchResponseDto> {
    this.validateExpiryDate(dto.expiryDate);

    if (dto.manufacturingDate) {
      this.validateManufacturingDate(dto.manufacturingDate, dto.expiryDate);
    }

    if (dto.initialQuantity <= 0) {
      throw new BadRequestException('Initial quantity must be greater than 0');
    }

    // Current quantity cannot exceed initial quantity
    const currentQuantity = dto.currentQuantity ?? dto.initialQuantity;
    if (currentQuantity > dto.initialQuantity) {
      throw new BadRequestException('Current quantity cannot exceed initial quantity');
    }

    // Check for duplicate batch number within same pharmacy and product
    const existing = await this.repository.findAll({
      providerId: dto.providerId,
      productId: dto.productId,
    });

    const duplicate = existing.find(
      (b: Record<string, unknown>) => b.batchNumber === dto.batchNumber && !b.deletedAt,
    );
    if (duplicate) {
      throw new ConflictException(
        `Batch number "${dto.batchNumber}" already exists for this product and pharmacy`,
      );
    }

    const status = this.determineInitialStatus(new Date(dto.expiryDate), currentQuantity);

    const record = await this.repository.create({
      providerId: dto.providerId,
      productId: dto.productId,
      batchNumber: dto.batchNumber,
      manufacturingDate: dto.manufacturingDate ? new Date(dto.manufacturingDate) : undefined,
      expiryDate: new Date(dto.expiryDate),
      initialQuantity: dto.initialQuantity,
      currentQuantity,
      purchasePrice: dto.purchasePrice,
      sellingPrice: dto.sellingPrice,
      status,
    });

    return this.toResponseDto(record);
  }

  async findById(id: string): Promise<BatchResponseDto> {
    const record = await this.repository.findById(id);
    if (!record || record.deletedAt) {
      throw new NotFoundException('Batch not found');
    }
    return this.toResponseDto(record);
  }

  async findAll(params: {
    providerId: string;
    productId?: string;
    status?: string;
    nearExpiry?: boolean;
    expired?: boolean;
  }): Promise<BatchResponseDto[]> {
    const records = await this.repository.findAll(params);
    return records
      .filter((record: Record<string, unknown>) => !record.deletedAt)
      .map((record: Record<string, unknown>) => this.toResponseDto(record));
  }

  async update(id: string, dto: UpdateBatchDto): Promise<BatchResponseDto> {
    const existing = await this.repository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Batch not found');
    }

    // Expired batches cannot become ACTIVE
    if (dto.status === BatchStatus.ACTIVE && existing.status === BatchStatus.EXPIRED) {
      throw new BadRequestException('Expired batches cannot be set to ACTIVE');
    }

    if (dto.expiryDate) {
      this.validateExpiryDate(dto.expiryDate);
    }

    const updateData: Record<string, unknown> = {};
    if (dto.batchNumber !== undefined) updateData.batchNumber = dto.batchNumber;
    if (dto.manufacturingDate !== undefined)
      updateData.manufacturingDate = new Date(dto.manufacturingDate);
    if (dto.expiryDate !== undefined) updateData.expiryDate = new Date(dto.expiryDate);
    if (dto.currentQuantity !== undefined) {
      if (dto.currentQuantity < 0) {
        throw new BadRequestException('Current quantity cannot be negative');
      }
      if (dto.currentQuantity > existing.initialQuantity) {
        throw new BadRequestException('Current quantity cannot exceed initial quantity');
      }
      updateData.currentQuantity = dto.currentQuantity;
      if (dto.currentQuantity <= 0) {
        updateData.status = BatchStatus.EXHAUSTED;
      }
    }
    if (dto.purchasePrice !== undefined) updateData.purchasePrice = dto.purchasePrice;
    if (dto.sellingPrice !== undefined) updateData.sellingPrice = dto.sellingPrice;
    if (dto.status !== undefined) updateData.status = dto.status;

    const updated = await this.repository.update(id, updateData);
    return this.toResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Batch not found');
    }
    await this.repository.softDelete(id);
  }

  private determineInitialStatus(expiryDate: Date, currentQuantity: number): BatchStatus {
    if (currentQuantity <= 0) return BatchStatus.EXHAUSTED;
    if (expiryDate < new Date()) return BatchStatus.EXPIRED;
    return BatchStatus.ACTIVE;
  }

  private validateExpiryDate(expiryDate: string): void {
    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime())) {
      throw new BadRequestException('Invalid expiry date');
    }
  }

  private validateManufacturingDate(manufacturingDate: string, expiryDate: string): void {
    const mfg = new Date(manufacturingDate);
    const exp = new Date(expiryDate);
    if (isNaN(mfg.getTime())) {
      throw new BadRequestException('Invalid manufacturing date');
    }
    if (mfg >= exp) {
      throw new BadRequestException('Manufacturing date must be before expiry date');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResponseDto(record: any): BatchResponseDto {
    const dto = new BatchResponseDto();
    dto.id = record.id;
    dto.providerId = record.providerId;
    dto.productId = record.productId;
    dto.batchNumber = record.batchNumber;
    dto.manufacturingDate = record.manufacturingDate
      ? record.manufacturingDate instanceof Date
        ? record.manufacturingDate.toISOString()
        : record.manufacturingDate
      : null;
    dto.expiryDate =
      record.expiryDate instanceof Date ? record.expiryDate.toISOString() : record.expiryDate;
    dto.initialQuantity = record.initialQuantity;
    dto.currentQuantity = record.currentQuantity;
    dto.purchasePrice = record.purchasePrice?.toString?.() ?? String(record.purchasePrice);
    dto.sellingPrice = record.sellingPrice?.toString?.() ?? String(record.sellingPrice);
    dto.status = record.status;
    dto.createdAt =
      record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt;
    dto.updatedAt =
      record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt;
    return dto;
  }
}
