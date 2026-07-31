import { Module } from '@nestjs/common';
import { AuditWriter } from '@medsphere/database';
import { MedicineReservationLifecycleService } from './medicine-reservation-lifecycle.service';
import { MedicineReservationService } from './medicine-reservation.service';

@Module({
  providers: [AuditWriter, MedicineReservationService, MedicineReservationLifecycleService],
  exports: [MedicineReservationService, MedicineReservationLifecycleService],
})
export class MedicineReservationModule {}
