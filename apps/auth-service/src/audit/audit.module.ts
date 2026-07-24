import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditPersistenceModule } from './audit-persistence.module';
import { AuditController } from './audit.controller';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Module({
  imports: [PrismaModule, AuditPersistenceModule, AuthorizationModule],
  controllers: [AuditController],
  providers: [AuditRepository, AuditService],
})
export class AuditModule {}
