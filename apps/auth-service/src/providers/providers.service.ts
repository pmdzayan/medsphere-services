import { Injectable, NotFoundException } from '@nestjs/common';
import { ProvidersRepository } from './providers.repository';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProviderResponseDto } from './dto/provider-response.dto';

@Injectable()
export class ProvidersService {
  constructor(private readonly repository: ProvidersRepository) {}

  async create(tenantId: string, dto: CreateProviderDto): Promise<ProviderResponseDto> {
    const record = await this.repository.create({
      tenantId,
      providerType: dto.providerType,
      businessName: dto.businessName,
      ownerName: dto.ownerName,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      city: dto.city,
      state: dto.state,
      country: dto.country,
      postalCode: dto.postalCode,
      latitude: dto.latitude,
      longitude: dto.longitude,
    });

    return this.toResponseDto(record);
  }

  async findById(id: string): Promise<ProviderResponseDto> {
    const record = await this.repository.findById(id);
    if (!record || record.deletedAt) {
      throw new NotFoundException('Provider not found');
    }
    return this.toResponseDto(record);
  }

  async findByTenant(tenantId: string): Promise<ProviderResponseDto[]> {
    const records = await this.repository.findByTenantId(tenantId);
    return records
      .filter((record: Record<string, unknown>) => !record.deletedAt)
      .map((record: Record<string, unknown>) => this.toResponseDto(record));
  }

  async update(id: string, dto: UpdateProviderDto): Promise<ProviderResponseDto> {
    const existing = await this.repository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Provider not found');
    }

    const updateData: Record<string, unknown> = {};
    if (dto.providerType !== undefined) updateData.providerType = dto.providerType;
    if (dto.businessName !== undefined) updateData.businessName = dto.businessName;
    if (dto.ownerName !== undefined) updateData.ownerName = dto.ownerName;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.state !== undefined) updateData.state = dto.state;
    if (dto.country !== undefined) updateData.country = dto.country;
    if (dto.postalCode !== undefined) updateData.postalCode = dto.postalCode;
    if (dto.latitude !== undefined) updateData.latitude = dto.latitude;
    if (dto.longitude !== undefined) updateData.longitude = dto.longitude;

    const updated = await this.repository.update(id, updateData);
    return this.toResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Provider not found');
    }

    await this.repository.softDelete(id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResponseDto(record: any): ProviderResponseDto {
    const dto = new ProviderResponseDto();
    dto.id = record.id;
    dto.tenantId = record.tenantId;
    dto.providerType = record.providerType;
    dto.businessName = record.businessName;
    dto.ownerName = record.ownerName;
    dto.email = record.email;
    dto.phone = record.phone;
    dto.address = record.address;
    dto.city = record.city;
    dto.state = record.state;
    dto.country = record.country;
    dto.postalCode = record.postalCode;
    dto.latitude = record.latitude;
    dto.longitude = record.longitude;
    dto.isVerified = record.isVerified;
    dto.isActive = record.isActive;
    dto.createdAt =
      record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt;
    dto.updatedAt =
      record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt;
    return dto;
  }
}
