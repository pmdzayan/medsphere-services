import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    name: string;
    genericName?: string;
    brand: string;
    category:
      | 'MEDICINE'
      | 'OTC'
      | 'COSMETIC'
      | 'AYURVEDIC'
      | 'SUPPLEMENT'
      | 'BABY_CARE'
      | 'PERSONAL_CARE'
      | 'MEDICAL_DEVICE';
    subCategory?: string;
    description?: string;
    manufacturer: string;
    dosageForm:
      | 'TABLET'
      | 'SYRUP'
      | 'INJECTION'
      | 'CREAM'
      | 'OINTMENT'
      | 'CAPSULE'
      | 'DROPS'
      | 'INHALER'
      | 'SPRAY'
      | 'LOTION'
      | 'GEL'
      | 'POWDER'
      | 'SOLUTION'
      | 'SUSPENSION';
    strength: string;
    barcode?: string;
    requiresPrescription?: boolean;
  }) {
    return this.prisma.client.product.create({
      data,
    });
  }

  async findById(id: string) {
    return this.prisma.client.product.findUnique({
      where: { id },
    });
  }

  async findAll(params?: { category?: string; search?: string }) {
    const where: Record<string, unknown> = { deletedAt: null };

    if (params?.category) {
      where.category = params.category;
    }

    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { brand: { contains: params.search, mode: 'insensitive' } },
        { barcode: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.client.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      genericName?: string;
      brand?: string;
      category?:
        | 'MEDICINE'
        | 'OTC'
        | 'COSMETIC'
        | 'AYURVEDIC'
        | 'SUPPLEMENT'
        | 'BABY_CARE'
        | 'PERSONAL_CARE'
        | 'MEDICAL_DEVICE';
      subCategory?: string;
      description?: string;
      manufacturer?: string;
      dosageForm?:
        | 'TABLET'
        | 'SYRUP'
        | 'INJECTION'
        | 'CREAM'
        | 'OINTMENT'
        | 'CAPSULE'
        | 'DROPS'
        | 'INHALER'
        | 'SPRAY'
        | 'LOTION'
        | 'GEL'
        | 'POWDER'
        | 'SOLUTION'
        | 'SUSPENSION';
      strength?: string;
      barcode?: string;
      requiresPrescription?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.prisma.client.product.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string) {
    return this.prisma.client.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
