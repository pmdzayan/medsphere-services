import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { PatientProfileService } from './patient-profile.service';
import { PatientProfileController } from './patient-profile.controller';

/**
 * Candidate Task 0032 (pre-0031). See
 * docs/candidates/0032-patient-identity-profile-dashboard-pre0031.md
 */
@Module({
  imports: [PrismaModule, AuditPersistenceModule],
  controllers: [PatientProfileController],
  providers: [PatientProfileService],
  exports: [PatientProfileService],
})
export class PatientProfileModule {}
