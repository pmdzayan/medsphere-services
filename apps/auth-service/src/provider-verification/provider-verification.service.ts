import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ProviderVerificationRepository } from './provider-verification.repository';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { ResubmitVerificationDto } from './dto/resubmit-verification.dto';
import { VerificationResponseDto } from './dto/verification-response.dto';

@Injectable()
export class ProviderVerificationService {
  constructor(private readonly repository: ProviderVerificationRepository) {}

  async submit(tenantId: string, dto: SubmitVerificationDto): Promise<VerificationResponseDto> {
    this.validateLicenseExpiry(dto.licenseExpiryDate);

    const record = await this.repository.create({
      tenantId,
      providerType: dto.providerType,
      licenseNumber: dto.licenseNumber,
      licenseExpiryDate: new Date(dto.licenseExpiryDate),
      businessRegistrationNumber: dto.businessRegistrationNumber,
      governmentIdReference: dto.governmentIdReference,
    });

    return this.toResponseDto(record);
  }

  async getStatus(verificationId: string): Promise<VerificationResponseDto> {
    const record = await this.repository.findById(verificationId);
    if (!record) {
      throw new NotFoundException('Verification record not found');
    }
    return this.toResponseDto(record);
  }

  async getByTenant(tenantId: string): Promise<VerificationResponseDto[]> {
    const records = await this.repository.findByTenantId(tenantId);
    return records.map((record: Record<string, unknown>) => this.toResponseDto(record));
  }

  async resubmit(
    verificationId: string,
    dto: ResubmitVerificationDto,
  ): Promise<VerificationResponseDto> {
    const existing = await this.repository.findById(verificationId);
    if (!existing) {
      throw new NotFoundException('Verification record not found');
    }

    if (existing.status !== 'REJECTED') {
      throw new BadRequestException('Only rejected verifications can be resubmitted');
    }

    if (dto.licenseExpiryDate) {
      this.validateLicenseExpiry(dto.licenseExpiryDate);
    }

    const updateData: Record<string, unknown> = {
      status: 'PENDING',
      verificationNotes: null,
      verifiedAt: null,
      verifiedBy: null,
    };

    if (dto.providerType) updateData.providerType = dto.providerType;
    if (dto.licenseNumber) updateData.licenseNumber = dto.licenseNumber;
    if (dto.licenseExpiryDate) updateData.licenseExpiryDate = new Date(dto.licenseExpiryDate);
    if (dto.businessRegistrationNumber)
      updateData.businessRegistrationNumber = dto.businessRegistrationNumber;
    if (dto.governmentIdReference) updateData.governmentIdReference = dto.governmentIdReference;

    const updated = await this.repository.update(verificationId, updateData);
    return this.toResponseDto(updated);
  }

  private validateLicenseExpiry(expiryDate: string): void {
    const expiry = new Date(expiryDate);
    const now = new Date();
    if (expiry <= now) {
      throw new BadRequestException('License expiry date must be in the future');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResponseDto(record: any): VerificationResponseDto {
    const dto = new VerificationResponseDto();
    dto.id = record.id;
    dto.tenantId = record.tenantId;
    dto.providerType = record.providerType;
    dto.status = record.status;
    dto.licenseNumber = record.licenseNumber;
    dto.licenseExpiryDate =
      record.licenseExpiryDate instanceof Date
        ? record.licenseExpiryDate.toISOString()
        : record.licenseExpiryDate;
    dto.businessRegistrationNumber = record.businessRegistrationNumber;
    dto.governmentIdReference = record.governmentIdReference;
    dto.verificationNotes = record.verificationNotes ?? null;
    dto.submittedAt =
      record.submittedAt instanceof Date ? record.submittedAt.toISOString() : record.submittedAt;
    dto.verifiedAt = record.verifiedAt
      ? record.verifiedAt instanceof Date
        ? record.verifiedAt.toISOString()
        : record.verifiedAt
      : null;
    dto.verifiedBy = record.verifiedBy ?? null;
    dto.createdAt =
      record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt;
    dto.updatedAt =
      record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt;
    return dto;
  }
}
