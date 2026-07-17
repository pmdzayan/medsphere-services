import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProvidersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    tenantId: string;
    providerType: 'PHARMACY' | 'HOSPITAL';
    businessName: string;
    ownerName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    latitude: number;
    longitude: number;
  }) {
    return this.prisma.client.provider.create({
      data,
    });
  }

  async findById(id: string) {
    return this.prisma.client.provider.findUnique({
      where: { id },
    });
  }

  async findByTenantId(tenantId: string) {
    return this.prisma.client.provider.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: {
      providerType?: 'PHARMACY' | 'HOSPITAL';
      businessName?: string;
      ownerName?: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
      postalCode?: string;
      latitude?: number;
      longitude?: number;
      isVerified?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.prisma.client.provider.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string) {
    return this.prisma.client.provider.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
