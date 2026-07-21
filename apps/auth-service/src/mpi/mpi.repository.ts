import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MpiRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createPatient(data: {
    tenantId: string;
    mrn: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    dateOfBirth: Date;
    gender: string;
    email?: string;
    phone?: string;
    nationalIdHash?: string;
    address?: Record<string, unknown>;
    emergencyContact?: Record<string, unknown>;
    bloodGroup?: string;
  }) {
    return this.prisma.client.patient.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        mrn: data.mrn,
        firstName: data.firstName,
        middleName: data.middleName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender as never,
        email: data.email,
        phone: data.phone,
        nationalIdHash: data.nationalIdHash,
        address: (data.address ?? undefined) as never,
        emergencyContact: (data.emergencyContact ?? undefined) as never,
        bloodGroup: data.bloodGroup,
      },
    });
  }

  async findPatientById(id: string) {
    return this.prisma.client.patient.findUnique({
      where: { id },
      include: {
        identifiers: true,
        linksAsSource: { include: { targetPatient: true } },
        linksAsTarget: { include: { sourcePatient: true } },
      },
    });
  }

  async findPatientByTenantMrn(tenantId: string, mrn: string) {
    return this.prisma.client.patient.findUnique({
      where: { tenantId_mrn: { tenantId, mrn } },
      include: { identifiers: true },
    });
  }

  async findPatientsByTenant(tenantId: string, skip = 0, take = 50) {
    const [data, total] = await Promise.all([
      this.prisma.client.patient.findMany({
        where: { tenantId, deletedAt: null },
        include: { identifiers: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.patient.count({
        where: { tenantId, deletedAt: null },
      }),
    ]);
    return { data, total, limit: take, offset: skip };
  }

  async updatePatient(
    id: string,
    data: {
      firstName?: string;
      middleName?: string;
      lastName?: string;
      dateOfBirth?: Date;
      gender?: string;
      email?: string;
      phone?: string;
      nationalIdHash?: string;
      address?: Record<string, unknown>;
      emergencyContact?: Record<string, unknown>;
      bloodGroup?: string;
      isDeceased?: boolean;
      deceasedAt?: Date;
    },
  ) {
    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.middleName !== undefined) updateData.middleName = data.middleName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth;
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.nationalIdHash !== undefined) updateData.nationalIdHash = data.nationalIdHash;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.emergencyContact !== undefined) updateData.emergencyContact = data.emergencyContact;
    if (data.bloodGroup !== undefined) updateData.bloodGroup = data.bloodGroup;
    if (data.isDeceased !== undefined) updateData.isDeceased = data.isDeceased;
    if (data.deceasedAt !== undefined) updateData.deceasedAt = data.deceasedAt;

    return this.prisma.client.patient.update({
      where: { id },
      data: updateData,
    });
  }

  async softDeletePatient(id: string) {
    return this.prisma.client.patient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // Identifiers
  async createIdentifier(data: {
    patientId: string;
    type: string;
    value: string;
    valueHash: string;
    isPrimary?: boolean;
  }) {
    return this.prisma.client.patientIdentifier.create({
      data: {
        patient: { connect: { id: data.patientId } },
        type: data.type as never,
        value: data.value,
        valueHash: data.valueHash,
        isPrimary: data.isPrimary ?? false,
      },
    });
  }

  async findIdentifiersByTypeValueHash(type: string, valueHash: string) {
    return this.prisma.client.patientIdentifier.findMany({
      where: { type: type as never, valueHash },
      include: { patient: true },
    });
  }

  // Patient Links
  async createPatientLink(data: {
    sourcePatientId: string;
    targetPatientId: string;
    confidence: string;
    score: number;
    reason: string;
  }) {
    return this.prisma.client.patientLink.create({
      data: {
        sourcePatient: { connect: { id: data.sourcePatientId } },
        targetPatient: { connect: { id: data.targetPatientId } },
        confidence: data.confidence as never,
        score: data.score,
        reason: data.reason,
      },
    });
  }

  async findLinksByPatientId(patientId: string) {
    return this.prisma.client.patientLink.findMany({
      where: {
        OR: [{ sourcePatientId: patientId }, { targetPatientId: patientId }],
      },
      include: {
        sourcePatient: true,
        targetPatient: true,
      },
    });
  }

  async verifyPatientLink(linkId: string, verifiedBy: string) {
    return this.prisma.client.patientLink.update({
      where: { id: linkId },
      data: { isVerified: true, verifiedBy },
    });
  }

  // Matching queries
  async findPatientsByNationalIdHash(nationalIdHash: string) {
    return this.prisma.client.patient.findMany({
      where: { nationalIdHash, deletedAt: null },
    });
  }

  async findPatientsByPhone(phone: string) {
    return this.prisma.client.patient.findMany({
      where: { phone, deletedAt: null },
    });
  }

  async findPatientsByEmail(email: string) {
    return this.prisma.client.patient.findMany({
      where: { email, deletedAt: null },
    });
  }
}
