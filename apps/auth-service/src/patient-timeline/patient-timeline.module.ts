import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PatientTimelineService } from './patient-timeline.service';
import { PatientTimelineController } from './patient-timeline.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PatientTimelineController],
  providers: [PatientTimelineService],
  exports: [PatientTimelineService],
})
export class PatientTimelineModule {}
