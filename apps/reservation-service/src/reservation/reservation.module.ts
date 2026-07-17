import { Module } from '@nestjs/common';
import { ReservationRepository } from './reservation.repository';
import { ReservationService } from './reservation.service';
import { ReservationController } from './reservation.controller';

@Module({
  controllers: [ReservationController],
  providers: [ReservationRepository, ReservationService],
  exports: [ReservationRepository, ReservationService],
})
export class ReservationModule {}
