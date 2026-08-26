import { Module } from '@nestjs/common';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountVerificationService } from './account-verification.service';
import { ExternalIdentityProvider } from './external-identity-provider';
import { PhoneOtpService } from './otp/phone-otp.service';
import { createSmsProviderRegistry } from './otp/sms-provider-registry.factory';
import { ContractSmsProviderRegistry } from './otp/sms-provider-activation.contracts';
import { VerificationController } from './verification.controller';

@Module({
  imports: [PrismaModule, AuditPersistenceModule, AuthModule],
  controllers: [VerificationController],
  providers: [
    AccountVerificationService,
    ExternalIdentityProvider,
    PhoneOtpService,
    {
      provide: ContractSmsProviderRegistry,
      useFactory: () => createSmsProviderRegistry(),
    },
  ],
  exports: [AccountVerificationService, ExternalIdentityProvider, PhoneOtpService],
})
export class VerificationModule {}
