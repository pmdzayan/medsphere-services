import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { PatientProfileService } from './patient-profile.service';
import { PatientProfileController } from './patient-profile.controller';

@Module({
  imports: [PrismaModule, AuditPersistenceModule],
  controllers: [PatientProfileController],
  providers: [PatientProfileService],
  exports: [PatientProfileService],
})
export class PatientProfileModule {}
