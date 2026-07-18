import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  AvailabilityService,
  ProductAvailabilityResult,
  MedicineAvailabilityResult,
  PaginatedAvailabilityResult,
} from './availability.service';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  @Get('product/:providerId/:productId')
  async getProductAvailability(
    @Param('providerId') providerId: string,
    @Param('productId') productId: string,
  ): Promise<ProductAvailabilityResult> {
    return this.service.getProductAvailability(providerId, productId);
  }

  @Get('pharmacy/:providerId')
  async getPharmacyAvailability(
    @Param('providerId') providerId: string,
    @Query('productId') productId?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('genericName') genericName?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PaginatedAvailabilityResult> {
    return this.service.getPharmacyAvailability(providerId, {
      productId,
      category,
      brand,
      genericName,
      search,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('medicine/:productId')
  async getMedicineAvailability(
    @Param('productId') productId: string,
  ): Promise<MedicineAvailabilityResult> {
    return this.service.getMedicineAvailability(productId);
  }

  @Get('search')
  async searchAvailableMedicines(
    @Query('providerId') providerId?: string,
    @Query('productId') productId?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('genericName') genericName?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PaginatedAvailabilityResult> {
    return this.service.searchAvailableMedicines({
      providerId,
      productId,
      category,
      brand,
      genericName,
      search,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('reservation-readiness/:providerId/:productId')
  async getReservationReadiness(
    @Param('providerId') providerId: string,
    @Param('productId') productId: string,
  ) {
    return this.service.getReservationReadiness(providerId, productId);
  }
}
