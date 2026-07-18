import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  NearbyService,
  PaginatedNearbyResult,
  PharmacyDetailResult,
  PharmacyMedicineAvailabilityResult,
} from './nearby.service';

@Controller('nearby')
export class NearbyController {
  constructor(private readonly service: NearbyService) {}

  @Get('pharmacies')
  async findNearbyPharmacies(
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Query('radius') radius?: string,
    @Query('productId') productId?: string,
    @Query('category') category?: string,
    @Query('verifiedOnly') verifiedOnly?: string,
    @Query('sortBy') sortBy?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PaginatedNearbyResult> {
    return this.service.findNearbyPharmacies({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      radius: radius ? parseInt(radius, 10) : undefined,
      productId,
      category,
      verifiedOnly: verifiedOnly === 'true',
      sortBy: sortBy as 'distance' | 'availability' | undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('pharmacy/:pharmacyId')
  async getPharmacyDetail(@Param('pharmacyId') pharmacyId: string): Promise<PharmacyDetailResult> {
    return this.service.getPharmacyDetail(pharmacyId);
  }

  @Get('pharmacy/:pharmacyId/medicine/:productId')
  async getMedicineAvailabilityByPharmacy(
    @Param('pharmacyId') pharmacyId: string,
    @Param('productId') productId: string,
    @Query('userLatitude') userLatitude?: string,
    @Query('userLongitude') userLongitude?: string,
  ): Promise<PharmacyMedicineAvailabilityResult> {
    return this.service.getMedicineAvailabilityByPharmacy(
      pharmacyId,
      productId,
      userLatitude ? parseFloat(userLatitude) : undefined,
      userLongitude ? parseFloat(userLongitude) : undefined,
    );
  }

  @Get('with-medicine')
  async findNearbyPharmaciesWithMedicine(
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Query('productId') productId: string,
    @Query('radius') radius?: string,
    @Query('verifiedOnly') verifiedOnly?: string,
    @Query('sortBy') sortBy?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PaginatedNearbyResult> {
    return this.service.findNearbyPharmaciesWithMedicine({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      productId,
      radius: radius ? parseInt(radius, 10) : undefined,
      verifiedOnly: verifiedOnly === 'true',
      sortBy: sortBy as 'distance' | 'availability' | undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
