import { Module } from '@nestjs/common';
import { ProviderVerificationRepository } from './provider-verification.repository';
import { ProviderVerificationService } from './provider-verification.service';
import { ProviderVerificationController } from './provider-verification.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProviderVerificationController],
  providers: [ProviderVerificationRepository, ProviderVerificationService],
  exports: [ProviderVerificationRepository, ProviderVerificationService],
})
export class ProviderVerificationModule {}
