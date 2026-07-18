import { Module } from '@nestjs/common';
import { NearbyService } from './nearby.service';
import { NearbyController } from './nearby.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [PrismaModule, AvailabilityModule],
  controllers: [NearbyController],
  providers: [NearbyService],
  exports: [NearbyService],
})
export class NearbyModule {}
