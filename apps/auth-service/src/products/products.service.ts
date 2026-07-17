import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductsRepository } from './products.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly repository: ProductsRepository) {}

  async create(dto: CreateProductDto): Promise<ProductResponseDto> {
    const record = await this.repository.create({
      name: dto.name,
      genericName: dto.genericName,
      brand: dto.brand,
      category: dto.category,
      subCategory: dto.subCategory,
      description: dto.description,
      manufacturer: dto.manufacturer,
      dosageForm: dto.dosageForm,
      strength: dto.strength,
      barcode: dto.barcode,
      requiresPrescription: dto.requiresPrescription ?? false,
    });

    return this.toResponseDto(record);
  }

  async findById(id: string): Promise<ProductResponseDto> {
    const record = await this.repository.findById(id);
    if (!record || record.deletedAt) {
      throw new NotFoundException('Product not found');
    }
    return this.toResponseDto(record);
  }

  async findAll(params?: { category?: string; search?: string }): Promise<ProductResponseDto[]> {
    const records = await this.repository.findAll(params);
    return records
      .filter((record: Record<string, unknown>) => !record.deletedAt)
      .map((record: Record<string, unknown>) => this.toResponseDto(record));
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponseDto> {
    const existing = await this.repository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Product not found');
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.genericName !== undefined) updateData.genericName = dto.genericName;
    if (dto.brand !== undefined) updateData.brand = dto.brand;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.subCategory !== undefined) updateData.subCategory = dto.subCategory;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.manufacturer !== undefined) updateData.manufacturer = dto.manufacturer;
    if (dto.dosageForm !== undefined) updateData.dosageForm = dto.dosageForm;
    if (dto.strength !== undefined) updateData.strength = dto.strength;
    if (dto.barcode !== undefined) updateData.barcode = dto.barcode;
    if (dto.requiresPrescription !== undefined)
      updateData.requiresPrescription = dto.requiresPrescription;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const updated = await this.repository.update(id, updateData);
    return this.toResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Product not found');
    }

    await this.repository.softDelete(id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResponseDto(record: any): ProductResponseDto {
    const dto = new ProductResponseDto();
    dto.id = record.id;
    dto.name = record.name;
    dto.genericName = record.genericName ?? null;
    dto.brand = record.brand;
    dto.category = record.category;
    dto.subCategory = record.subCategory ?? null;
    dto.description = record.description ?? null;
    dto.manufacturer = record.manufacturer;
    dto.dosageForm = record.dosageForm;
    dto.strength = record.strength;
    dto.barcode = record.barcode ?? null;
    dto.requiresPrescription = record.requiresPrescription;
    dto.isActive = record.isActive;
    dto.createdAt =
      record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt;
    dto.updatedAt =
      record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt;
    return dto;
  }
}
