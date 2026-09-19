import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PatientNotificationService } from './patient-notification.service';
import { PatientNotificationController } from './patient-notification.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PatientNotificationController],
  providers: [PatientNotificationService],
  exports: [PatientNotificationService],
})
export class PatientNotificationModule {}
