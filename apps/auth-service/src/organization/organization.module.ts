import { Module } from '@nestjs/common';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationOnboardingService } from './organization-onboarding.service';
import { OrganizationJoinCodeController } from './organization-join-code.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuthConfigService } from '../auth/auth-config.service';

/**
 * AuthConfigService is provided directly instead of importing AuthModule,
 * keeping AuthModule -> OrganizationModule acyclic while allowing the
 * protected management controller to read the join-code pepper.
 */
@Module({
  imports: [PrismaModule, AuditPersistenceModule, AuthorizationModule],
  controllers: [OrganizationJoinCodeController],
  providers: [OrganizationOnboardingService, AuthConfigService],
  exports: [OrganizationOnboardingService],
})
export class OrganizationModule {}
