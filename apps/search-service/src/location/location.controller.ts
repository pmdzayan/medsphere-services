import { Controller, Get, Param, Query } from '@nestjs/common';
import { LocationService } from './location.service';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import { NearbyResponseDto, NearbyProviderDto } from './dto/nearby-response.dto';

@Controller('providers')
export class LocationController {
  constructor(private readonly service: LocationService) {}

  @Get('nearby')
  async findNearby(@Query() query: NearbyQueryDto): Promise<NearbyResponseDto> {
    return this.service.findNearby(query);
  }

  @Get(':id/location')
  async findProviderLocation(@Param('id') id: string): Promise<NearbyProviderDto> {
    return this.service.findProviderLocation(id);
  }
}
