import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { MpiRepository } from './mpi.repository';
import { MpiMatchingService } from './mpi-matching.service';
import { CreatePatientDto } from './dto/create-patient.dto';

@Injectable()
export class MpiService {
  constructor(
    private readonly repository: MpiRepository,
    private readonly matchingService: MpiMatchingService,
  ) {}

  async createPatient(dto: CreatePatientDto) {
    // Check for duplicate MRN within tenant
    const existing = await this.repository.findPatientByTenantMrn(dto.tenantId, dto.mrn);
    if (existing) {
      throw new ConflictException('Patient with this MRN already exists in the tenant');
    }

    const patient = await this.repository.createPatient({
      tenantId: dto.tenantId,
      mrn: dto.mrn,
      firstName: dto.firstName,
      middleName: dto.middleName,
      lastName: dto.lastName,
      dateOfBirth: new Date(dto.dateOfBirth),
      gender: dto.gender,
      email: dto.email,
      phone: dto.phone,
      nationalIdHash: dto.nationalIdHash,
      address: dto.address,
      emergencyContact: dto.emergencyContact,
      bloodGroup: dto.bloodGroup,
    });

    // Create identifiers if provided
    if (dto.identifiers && dto.identifiers.length > 0) {
      for (const idDto of dto.identifiers) {
        const valueHash = this.matchingService.hashValue(idDto.value);
        await this.repository.createIdentifier({
          patientId: patient.id,
          type: idDto.type,
          value: idDto.value,
          valueHash,
          isPrimary: idDto.isPrimary,
        });
      }
    }

    // Run matching against existing patients
    if (dto.nationalIdHash || dto.phone || dto.email) {
      const matches = await this.matchingService.findMatches({
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: new Date(dto.dateOfBirth),
        phone: dto.phone,
        email: dto.email,
        nationalIdHash: dto.nationalIdHash,
      });

      // Auto-link EXACT matches; flag others for review
      for (const match of matches) {
        if (match.confidence === 'EXACT') {
          await this.matchingService.createLink(
            patient.id,
            match.patientId,
            match.score,
            match.confidence,
            match.reason,
          );
        }
      }
    }

    return this.repository.findPatientById(patient.id);
  }

  async findPatientById(id: string) {
    const patient = await this.repository.findPatientById(id);
    if (!patient || patient.deletedAt) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }

  async findPatientsByTenant(tenantId: string, skip?: number, take?: number) {
    return this.repository.findPatientsByTenant(tenantId, skip, take);
  }

  async findPatientByTenantMrn(tenantId: string, mrn: string) {
    const patient = await this.repository.findPatientByTenantMrn(tenantId, mrn);
    if (!patient || patient.deletedAt) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }

  async updatePatient(
    id: string,
    data: {
      firstName?: string;
      middleName?: string;
      lastName?: string;
      dateOfBirth?: string;
      gender?: string;
      email?: string;
      phone?: string;
      address?: Record<string, unknown>;
      emergencyContact?: Record<string, unknown>;
      bloodGroup?: string;
      isDeceased?: boolean;
      deceasedAt?: string;
    },
  ) {
    const existing = await this.repository.findPatientById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Patient not found');
    }

    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.middleName !== undefined) updateData.middleName = data.middleName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = new Date(data.dateOfBirth);
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.emergencyContact !== undefined) updateData.emergencyContact = data.emergencyContact;
    if (data.bloodGroup !== undefined) updateData.bloodGroup = data.bloodGroup;
    if (data.isDeceased !== undefined) updateData.isDeceased = data.isDeceased;
    if (data.deceasedAt !== undefined) updateData.deceasedAt = new Date(data.deceasedAt);

    return this.repository.updatePatient(id, updateData as never);
  }

  async deletePatient(id: string): Promise<void> {
    const existing = await this.repository.findPatientById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Patient not found');
    }
    await this.repository.softDeletePatient(id);
  }

  async findMatches(patientId: string) {
    const patient = await this.repository.findPatientById(patientId);
    if (!patient || patient.deletedAt) {
      throw new NotFoundException('Patient not found');
    }
    return this.matchingService.findMatches({
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      phone: patient.phone ?? undefined,
      email: patient.email ?? undefined,
      nationalIdHash: patient.nationalIdHash ?? undefined,
    });
  }

  async getPatientLinks(patientId: string) {
    return this.repository.findLinksByPatientId(patientId);
  }

  async verifyPatientLink(linkId: string, verifiedBy: string) {
    return this.matchingService.verifyLink(linkId, verifiedBy);
  }

  async addIdentifier(data: {
    patientId: string;
    type: string;
    value: string;
    isPrimary?: boolean;
  }) {
    const patient = await this.repository.findPatientById(data.patientId);
    if (!patient || patient.deletedAt) {
      throw new NotFoundException('Patient not found');
    }

    const valueHash = this.matchingService.hashValue(data.value);
    return this.repository.createIdentifier({
      patientId: data.patientId,
      type: data.type,
      value: data.value,
      valueHash,
      isPrimary: data.isPrimary,
    });
  }
}
