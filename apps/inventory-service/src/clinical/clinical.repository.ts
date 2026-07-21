import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClinicalRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Encounters ----

  async createEncounter(data: {
    tenantId: string;
    patientId: string;
    practitionerId: string;
    locationId?: string;
    type: string;
    chiefComplaint?: string;
  }) {
    return this.prisma.client.encounter.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        patient: { connect: { id: data.patientId } },
        practitioner: { connect: { id: data.practitionerId } },
        locationId: data.locationId,
        type: data.type as never,
        chiefComplaint: data.chiefComplaint,
      },
      include: {
        clinicalNotes: true,
        vitalSigns: true,
        prescriptions: { include: { items: true } },
      },
    });
  }

  async findEncounterById(id: string) {
    return this.prisma.client.encounter.findUnique({
      where: { id },
      include: {
        clinicalNotes: true,
        vitalSigns: true,
        prescriptions: { include: { items: true } },
      },
    });
  }

  async findEncountersByPatient(tenantId: string, patientId: string) {
    return this.prisma.client.encounter.findMany({
      where: { tenantId, patientId },
      orderBy: { createdAt: 'desc' },
      include: { clinicalNotes: true, vitalSigns: true },
    });
  }

  async updateEncounterStatus(id: string, status: string, startedAt?: Date, endedAt?: Date) {
    const data: Record<string, unknown> = { status: status as never };
    if (startedAt !== undefined) data.startedAt = startedAt;
    if (endedAt !== undefined) data.endedAt = endedAt;
    return this.prisma.client.encounter.update({ where: { id }, data });
  }

  // ---- Clinical Notes ----

  async upsertClinicalNote(data: {
    tenantId: string;
    encounterId: string;
    authorId: string;
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
    isFinalized: boolean;
  }) {
    // Check if a note already exists for this encounter
    const existing = await this.prisma.client.clinicalNote.findFirst({
      where: { encounterId: data.encounterId },
    });

    if (existing) {
      return this.prisma.client.clinicalNote.update({
        where: { id: existing.id },
        data: {
          subjective: data.subjective,
          objective: data.objective,
          assessment: data.assessment,
          plan: data.plan,
          isFinalized: data.isFinalized,
          finalizedAt: data.isFinalized ? new Date() : null,
        },
      });
    }

    return this.prisma.client.clinicalNote.create({
      data: {
        tenantId: data.tenantId,
        encounterId: data.encounterId,
        authorId: data.authorId,
        subjective: data.subjective,
        objective: data.objective,
        assessment: data.assessment,
        plan: data.plan,
        isFinalized: data.isFinalized,
        finalizedAt: data.isFinalized ? new Date() : null,
      },
    });
  }

  // ---- Vital Signs ----

  async recordVitalSigns(data: {
    tenantId: string;
    encounterId: string;
    patientId: string;
    systolicBp?: number;
    diastolicBp?: number;
    heartRate?: number;
    temperature?: number;
    spO2?: number;
    respiratoryRate?: number;
    weight?: number;
    height?: number;
    bmi?: number;
  }) {
    return this.prisma.client.vitalSign.create({ data });
  }

  // ---- Prescriptions ----

  async createPrescription(data: {
    tenantId: string;
    encounterId: string;
    patientId: string;
    practitionerId: string;
    targetLocationId: string;
    notes?: string;
  }) {
    return this.prisma.client.prescription.create({
      data: {
        tenantId: data.tenantId,
        encounterId: data.encounterId,
        patientId: data.patientId,
        practitionerId: data.practitionerId,
        targetLocationId: data.targetLocationId,
        notes: data.notes,
      },
      include: { items: true },
    });
  }

  async createPrescriptionItem(data: {
    prescriptionId: string;
    productId: string;
    dosage: string;
    frequency: string;
    durationDays: number;
    quantity: number;
    instructions?: string;
  }) {
    return this.prisma.client.prescriptionItem.create({ data });
  }

  async updatePrescriptionStatus(id: string, status: string, submittedAt?: Date) {
    const data: Record<string, unknown> = { status: status as never };
    if (submittedAt !== undefined) data.submittedAt = submittedAt;
    return this.prisma.client.prescription.update({
      where: { id },
      data,
      include: { items: true },
    });
  }

  async findPrescriptionById(id: string) {
    return this.prisma.client.prescription.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
  }

  async findPrescriptionsByPatient(tenantId: string, patientId: string) {
    return this.prisma.client.prescription.findMany({
      where: { tenantId, patientId },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: true } } },
    });
  }
}
