import { Module } from '@nestjs/common';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountVerificationService } from './account-verification.service';
import { ExternalIdentityProvider } from './external-identity-provider';
import { VerificationController } from './verification.controller';

@Module({
  imports: [PrismaModule, AuditPersistenceModule],
  controllers: [VerificationController],
  providers: [AccountVerificationService, ExternalIdentityProvider],
  exports: [AccountVerificationService, ExternalIdentityProvider],
})
export class VerificationModule {}
