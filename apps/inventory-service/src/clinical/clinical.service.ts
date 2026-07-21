import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClinicalRepository } from './clinical.repository';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { UpdateEncounterStatusDto } from './dto/update-encounter-status.dto';
import { RecordVitalSignsDto } from './dto/record-vital-signs.dto';
import { SaveClinicalNoteDto } from './dto/save-clinical-note.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { EncounterStatus, PrescriptionStatus } from './enums';

@Injectable()
export class ClinicalService {
  constructor(private readonly repository: ClinicalRepository) {}

  // ---- Encounters ----

  async createEncounter(dto: CreateEncounterDto) {
    return this.repository.createEncounter({
      tenantId: dto.tenantId,
      patientId: dto.patientId,
      practitionerId: dto.practitionerId,
      locationId: dto.locationId,
      type: dto.type,
      chiefComplaint: dto.chiefComplaint,
    });
  }

  async findEncounterById(id: string) {
    const encounter = await this.repository.findEncounterById(id);
    if (!encounter) throw new NotFoundException('Encounter not found');
    return encounter;
  }

  async findEncountersByPatient(tenantId: string, patientId: string) {
    return this.repository.findEncountersByPatient(tenantId, patientId);
  }

  async updateEncounterStatus(id: string, dto: UpdateEncounterStatusDto) {
    const encounter = await this.repository.findEncounterById(id);
    if (!encounter) throw new NotFoundException('Encounter not found');

    const startedAt = dto.status === EncounterStatus.IN_PROGRESS ? new Date() : undefined;
    const endedAt =
      dto.status === EncounterStatus.COMPLETED || dto.status === EncounterStatus.CANCELLED
        ? new Date()
        : undefined;

    return this.repository.updateEncounterStatus(id, dto.status, startedAt, endedAt);
  }

  // ---- Clinical Notes (SOAP) ----

  async saveClinicalNote(dto: SaveClinicalNoteDto) {
    const encounter = await this.repository.findEncounterById(dto.encounterId);
    if (!encounter) throw new NotFoundException('Encounter not found');

    return this.repository.upsertClinicalNote({
      tenantId: encounter.tenantId,
      encounterId: dto.encounterId,
      authorId: dto.authorId,
      subjective: dto.subjective,
      objective: dto.objective,
      assessment: dto.assessment,
      plan: dto.plan,
      isFinalized: dto.isFinalized ?? false,
    });
  }

  // ---- Vital Signs ----

  async recordVitalSigns(dto: RecordVitalSignsDto) {
    const encounter = await this.repository.findEncounterById(dto.encounterId);
    if (!encounter) throw new NotFoundException('Encounter not found');

    // Calculate BMI if both weight and height provided
    let bmi: number | undefined;
    if (dto.weight && dto.height) {
      bmi = dto.weight / ((dto.height / 100) * (dto.height / 100));
      bmi = Math.round(bmi * 10) / 10;
    }

    return this.repository.recordVitalSigns({
      tenantId: encounter.tenantId,
      encounterId: dto.encounterId,
      patientId: dto.patientId,
      systolicBp: dto.systolicBp,
      diastolicBp: dto.diastolicBp,
      heartRate: dto.heartRate,
      temperature: dto.temperature,
      spO2: dto.spO2,
      respiratoryRate: dto.respiratoryRate,
      weight: dto.weight,
      height: dto.height,
      bmi,
    });
  }

  // ---- Prescriptions ----

  async createPrescription(dto: CreatePrescriptionDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Prescription must have at least one item');
    }

    // Create the prescription
    const prescription = await this.repository.createPrescription({
      tenantId: dto.tenantId,
      encounterId: dto.encounterId,
      patientId: dto.patientId,
      practitionerId: dto.practitionerId,
      targetLocationId: dto.targetLocationId,
      notes: dto.notes,
    });

    // Create prescription items
    for (const item of dto.items) {
      await this.repository.createPrescriptionItem({
        prescriptionId: prescription.id,
        productId: item.productId,
        dosage: item.dosage,
        frequency: item.frequency,
        durationDays: item.durationDays,
        quantity: item.quantity,
        instructions: item.instructions,
      });
    }

    return this.repository.findPrescriptionById(prescription.id);
  }

  async submitPrescription(prescriptionId: string) {
    const prescription = await this.repository.findPrescriptionById(prescriptionId);
    if (!prescription) throw new NotFoundException('Prescription not found');
    if (prescription.status !== PrescriptionStatus.DRAFT) {
      throw new BadRequestException(`Cannot submit prescription in status: ${prescription.status}`);
    }
    return this.repository.updatePrescriptionStatus(
      prescriptionId,
      PrescriptionStatus.SUBMITTED,
      new Date(),
    );
  }

  async findPrescriptionById(id: string) {
    const prescription = await this.repository.findPrescriptionById(id);
    if (!prescription) throw new NotFoundException('Prescription not found');
    return prescription;
  }

  async findPrescriptionsByPatient(tenantId: string, patientId: string) {
    return this.repository.findPrescriptionsByPatient(tenantId, patientId);
  }
}
