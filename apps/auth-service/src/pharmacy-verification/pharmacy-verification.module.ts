import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { PlatformModule } from '../platform/platform.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PharmacyVerificationEligibilityEvaluator } from './pharmacy-verification-eligibility.evaluator';
import { ProviderVerificationService } from './provider-verification.service';
import { PharmacyVerificationController } from './pharmacy-verification.controller';
import { PlatformProviderVerificationController } from './platform-provider-verification.controller';

/**
 * Candidate Task 0039 (PROVISIONAL). See
 * docs/candidates/0039-pharmacy-onboarding-verification-provisional.md
 */
@Module({
  imports: [PrismaModule, AuditPersistenceModule, PlatformModule, AuthorizationModule],
  controllers: [PharmacyVerificationController, PlatformProviderVerificationController],
  providers: [PharmacyVerificationEligibilityEvaluator, ProviderVerificationService],
  exports: [PharmacyVerificationEligibilityEvaluator, ProviderVerificationService],
})
export class PharmacyVerificationModule {}
