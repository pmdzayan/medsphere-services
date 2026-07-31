import { Module } from '@nestjs/common';
import { AuditWriter } from '@medsphere/database';
import { MedicineReservationService } from './medicine-reservation.service';

@Module({
  providers: [AuditWriter, MedicineReservationService],
  exports: [MedicineReservationService],
})
export class MedicineReservationModule {}
