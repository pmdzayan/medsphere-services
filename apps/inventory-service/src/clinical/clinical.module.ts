import { Module } from '@nestjs/common';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { ClinicalRepository } from './clinical.repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicalController],
  providers: [ClinicalService, ClinicalRepository],
  exports: [ClinicalService, ClinicalRepository],
})
export class ClinicalModule {}
