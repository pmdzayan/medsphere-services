import { Module } from '@nestjs/common';
import { HealthModule } from '@medsphere/common';
import { PrismaModule } from './prisma/prisma.module';
import { MedicineReservationModule } from './medicine-reservation/medicine-reservation.module';
import { StockModule } from './stock/stock.module';

@Module({
  imports: [HealthModule, PrismaModule, StockModule, MedicineReservationModule],
})
export class AppModule {}
