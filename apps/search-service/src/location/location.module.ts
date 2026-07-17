import { Module } from '@nestjs/common';
import { LocationRepository } from './location.repository';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';

@Module({
  controllers: [LocationController],
  providers: [LocationRepository, LocationService],
  exports: [LocationRepository, LocationService],
})
export class LocationModule {}
