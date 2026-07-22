import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentCategory } from './enums';

/**
 * Data access layer for document management.
 *
 * Follows the same repository pattern as NotificationRepository,
 * using PrismaService to interact with the database.
 */
@Injectable()
export class DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // === Document ===

  async createDocument(data: {
    tenantId: string;
    patientId?: string | null;
    uploaderId: string;
    category: DocumentCategory;
    title: string;
    description?: string | null;
    originalName: string;
    mimeType: string;
    fileSize: number;
    storageBucket: string;
    storageKey: string;
    checksumSha256: string;
    isEncrypted?: boolean;
    isSigned?: boolean;
    signatureData?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const createData: Record<string, unknown> = {
      tenant: { connect: { id: data.tenantId } },
      uploader: { connect: { id: data.uploaderId } },
      category: data.category,
      title: data.title,
      originalName: data.originalName,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      storageBucket: data.storageBucket,
      storageKey: data.storageKey,
      checksumSha256: data.checksumSha256,
      isEncrypted: data.isEncrypted ?? true,
      isSigned: data.isSigned ?? false,
    };

    if (data.patientId) {
      createData.patient = { connect: { id: data.patientId } };
    }
    if (data.description !== undefined) createData.description = data.description;
    if (data.signatureData !== undefined) createData.signatureData = data.signatureData;
    if (data.metadata !== undefined) createData.metadata = data.metadata;

    return this.prisma.client.document.create({
      data: createData as never,
    });
  }

  async findById(id: string) {
    return this.prisma.client.document.findUnique({
      where: { id },
      include: {
        tenant: true,
        patient: true,
        uploader: true,
      },
    });
  }

  async findByTenant(tenantId: string, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.document.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.document.count({ where: { tenantId } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async findByPatient(tenantId: string, patientId: string, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.document.findMany({
        where: { tenantId, patientId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.document.count({ where: { tenantId, patientId } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async findByCategory(tenantId: string, category: DocumentCategory, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.document.findMany({
        where: { tenantId, category },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.document.count({ where: { tenantId, category } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async findByChecksum(checksumSha256: string) {
    return this.prisma.client.document.findMany({
      where: { checksumSha256 },
    });
  }

  async updateDocument(id: string, data: Record<string, unknown>) {
    return this.prisma.client.document.update({
      where: { id },
      data,
    });
  }

  async updateSignature(id: string, signatureData: Record<string, unknown>) {
    return this.prisma.client.document.update({
      where: { id },
      data: {
        isSigned: true,
        signatureData: signatureData as never,
      },
    });
  }

  async deleteDocument(id: string) {
    return this.prisma.client.document.delete({
      where: { id },
    });
  }

  // === DocumentAccessLog ===

  async createAccessLog(data: {
    tenantId: string;
    documentId: string;
    accessedById: string;
    action: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
  }) {
    const createData: Record<string, unknown> = {
      tenant: { connect: { id: data.tenantId } },
      document: { connect: { id: data.documentId } },
      accessedBy: { connect: { id: data.accessedById } },
      action: data.action,
    };

    if (data.ipAddress !== undefined) createData.ipAddress = data.ipAddress;
    if (data.userAgent !== undefined) createData.userAgent = data.userAgent;
    if (data.correlationId !== undefined) createData.correlationId = data.correlationId;

    return this.prisma.client.documentAccessLog.create({
      data: createData as never,
    });
  }

  async findAccessLogsByDocument(tenantId: string, documentId: string, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.documentAccessLog.findMany({
        where: { tenantId, documentId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          accessedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.client.documentAccessLog.count({ where: { tenantId, documentId } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async findAccessLogsByUser(tenantId: string, accessedById: string, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.documentAccessLog.findMany({
        where: { tenantId, accessedById },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          document: { select: { id: true, title: true, category: true } },
        },
      }),
      this.prisma.client.documentAccessLog.count({ where: { tenantId, accessedById } }),
    ]);
    return { data, total, limit: take, offset: skip };
  }
}
