import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MedicalRecordType } from './enums/medical-record-type.enum';

@Injectable()
export class HealthVaultRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    userId: string;
    recordType: MedicalRecordType;
    title: string;
    description?: string;
    fileUrl: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    recordDate: Date;
  }) {
    return this.prisma.client.medicalRecord.create({
      data: {
        userId: data.userId,
        recordType: data.recordType,
        title: data.title,
        description: data.description,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        recordDate: data.recordDate,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.client.medicalRecord.findUnique({
      where: { id },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.client.medicalRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: {
      recordType?: MedicalRecordType;
      title?: string;
      description?: string;
      recordDate?: Date;
    },
  ) {
    return this.prisma.client.medicalRecord.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string) {
    return this.prisma.client.medicalRecord.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
