import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ClinicalService } from './clinical.service';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { UpdateEncounterStatusDto } from './dto/update-encounter-status.dto';
import { RecordVitalSignsDto } from './dto/record-vital-signs.dto';
import { SaveClinicalNoteDto } from './dto/save-clinical-note.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';

@Controller('clinical')
export class ClinicalController {
  constructor(private readonly service: ClinicalService) {}

  // ---- Encounters ----

  @Post('encounters')
  async createEncounter(@Body() dto: CreateEncounterDto) {
    return this.service.createEncounter(dto);
  }

  @Get('encounters/:id')
  async findEncounterById(@Param('id') id: string) {
    return this.service.findEncounterById(id);
  }

  @Get('encounters')
  async findEncountersByPatient(
    @Query('tenantId') tenantId: string,
    @Query('patientId') patientId: string,
  ) {
    return this.service.findEncountersByPatient(tenantId, patientId);
  }

  @Put('encounters/:id/status')
  async updateEncounterStatus(@Param('id') id: string, @Body() dto: UpdateEncounterStatusDto) {
    return this.service.updateEncounterStatus(id, dto);
  }

  // ---- Clinical Notes ----

  @Post('notes')
  async saveClinicalNote(@Body() dto: SaveClinicalNoteDto) {
    return this.service.saveClinicalNote(dto);
  }

  // ---- Vital Signs ----

  @Post('vital-signs')
  async recordVitalSigns(@Body() dto: RecordVitalSignsDto) {
    return this.service.recordVitalSigns(dto);
  }

  // ---- Prescriptions ----

  @Post('prescriptions')
  async createPrescription(@Body() dto: CreatePrescriptionDto) {
    return this.service.createPrescription(dto);
  }

  @Post('prescriptions/:id/submit')
  async submitPrescription(@Param('id') id: string) {
    return this.service.submitPrescription(id);
  }

  @Get('prescriptions/:id')
  async findPrescriptionById(@Param('id') id: string) {
    return this.service.findPrescriptionById(id);
  }

  @Get('prescriptions')
  async findPrescriptionsByPatient(
    @Query('tenantId') tenantId: string,
    @Query('patientId') patientId: string,
  ) {
    return this.service.findPrescriptionsByPatient(tenantId, patientId);
  }
}
