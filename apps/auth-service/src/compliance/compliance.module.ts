import { Module } from '@nestjs/common';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ComplianceService } from './compliance.service';
import { ComplianceSubjectController } from './compliance-subject.controller';
import { ComplianceRetentionService } from './compliance-retention.service';

@Module({
  imports: [PrismaModule, AuditPersistenceModule],
  controllers: [ComplianceSubjectController],
  providers: [ComplianceService, ComplianceRetentionService],
  exports: [ComplianceService, ComplianceRetentionService],
})
export class ComplianceModule {}
