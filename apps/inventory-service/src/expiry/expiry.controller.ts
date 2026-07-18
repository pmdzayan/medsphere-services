import { Controller, Get, Param, Query } from '@nestjs/common';
import { ExpiryService, ExpiryDashboard, PaginatedExpiryResult } from './expiry.service';
import { ExpiryQueryDto } from './dto/expiry-query.dto';

@Controller('expiry')
export class ExpiryController {
  constructor(private readonly service: ExpiryService) {}

  @Get('dashboard/:providerId')
  async getDashboard(@Param('providerId') providerId: string): Promise<ExpiryDashboard> {
    return this.service.getDashboard(providerId);
  }

  @Get('pharmacy-dashboard/:providerId')
  async getPharmacyExpiryDashboard(
    @Param('providerId') providerId: string,
  ): Promise<ExpiryDashboard> {
    return this.service.getPharmacyExpiryDashboard(providerId);
  }

  @Get('expired/:providerId')
  async getExpired(
    @Param('providerId') providerId: string,
    @Query() query: ExpiryQueryDto,
  ): Promise<PaginatedExpiryResult> {
    return this.service.getExpiredBatches(providerId, query);
  }

  @Get('expiring-soon/:providerId')
  async getExpiringSoon(
    @Param('providerId') providerId: string,
    @Query() query: ExpiryQueryDto,
  ): Promise<PaginatedExpiryResult> {
    return this.service.getExpiringSoonBatches(providerId, query);
  }

  @Get('summary/:providerId')
  async getBatchExpirySummary(
    @Param('providerId') providerId: string,
    @Query() query: ExpiryQueryDto,
  ): Promise<PaginatedExpiryResult> {
    return this.service.getBatchExpirySummary(providerId, query);
  }

  @Get('expiring/:providerId')
  async getExpiring(
    @Param('providerId') providerId: string,
    @Query('days') days?: string,
  ): Promise<PaginatedExpiryResult> {
    const query: ExpiryQueryDto = {};
    if (days) {
      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + parseInt(days, 10));
      query.startDate = now.toISOString();
      query.endDate = future.toISOString();
    }
    return this.service.getBatchExpirySummary(providerId, query);
  }

  @Get('safe/:providerId')
  async getSafe(
    @Param('providerId') providerId: string,
    @Query() query: ExpiryQueryDto,
  ): Promise<PaginatedExpiryResult> {
    const safeQuery = { ...query, status: 'SAFE' };
    return this.service.getBatchExpirySummary(providerId, safeQuery);
  }
}
