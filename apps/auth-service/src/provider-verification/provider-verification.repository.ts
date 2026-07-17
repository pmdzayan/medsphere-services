import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProviderVerificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    tenantId: string;
    providerType: 'PHARMACY' | 'HOSPITAL';
    licenseNumber: string;
    licenseExpiryDate: Date;
    businessRegistrationNumber: string;
    governmentIdReference: string;
  }) {
    return this.prisma.client.providerVerification.create({
      data,
    });
  }

  async findById(id: string) {
    return this.prisma.client.providerVerification.findUnique({
      where: { id },
    });
  }

  async findByTenantId(tenantId: string) {
    return this.prisma.client.providerVerification.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: {
      providerType?: 'PHARMACY' | 'HOSPITAL';
      licenseNumber?: string;
      licenseExpiryDate?: Date;
      businessRegistrationNumber?: string;
      governmentIdReference?: string;
      status?: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'EXPIRED';
      verificationNotes?: string;
      verifiedAt?: Date;
      verifiedBy?: string;
    },
  ) {
    return this.prisma.client.providerVerification.update({
      where: { id },
      data,
    });
  }
}
