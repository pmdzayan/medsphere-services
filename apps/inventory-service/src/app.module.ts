import { Module } from '@nestjs/common';
import { HealthModule } from '@medsphere/common';
import { PrismaModule } from './prisma/prisma.module';
import { MedicineReservationModule } from './medicine-reservation/medicine-reservation.module';

@Module({
  imports: [HealthModule, PrismaModule, MedicineReservationModule],
})
export class AppModule {}
