import { Module } from '@nestjs/common';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ComplianceService } from './compliance.service';

@Module({
  imports: [PrismaModule, AuditPersistenceModule],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
