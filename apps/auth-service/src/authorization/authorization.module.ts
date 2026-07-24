import { Module } from '@nestjs/common';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthorizationController } from './authorization.controller';
import { AuthorizationRepository } from './authorization.repository';
import { AuthorizationService } from './authorization.service';
import { PermissionsGuard } from './permissions.guard';

@Module({
  imports: [PrismaModule, AuditPersistenceModule],
  controllers: [AuthorizationController],
  providers: [AuthorizationRepository, AuthorizationService, PermissionsGuard],
  exports: [AuthorizationService, PermissionsGuard],
})
export class AuthorizationModule {}
