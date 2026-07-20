import { Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditEventService } from './audit-event.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [AuditController],
  providers: [AuditRepository, AuditService, AuditEventService],
  exports: [AuditRepository, AuditService, AuditEventService],
})
export class AuditModule {}
