import { Module } from '@nestjs/common';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProviderDomainController } from './provider-domain.controller';
import { ProviderDomainService } from './provider-domain.service';

@Module({
  imports: [PrismaModule, AuditPersistenceModule, AuthorizationModule],
  controllers: [ProviderDomainController],
  providers: [ProviderDomainService],
  exports: [ProviderDomainService],
})
export class ProviderDomainModule {}
