import { Controller, Get, Param } from '@nestjs/common';
import {
  DashboardService,
  DashboardSummaryResult,
  ExpiryAnalyticsResult,
  StockAnalyticsResult,
  FinancialAnalyticsResult,
  ChartDataResult,
} from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary/:providerId')
  async getSummary(@Param('providerId') providerId: string): Promise<DashboardSummaryResult> {
    return this.service.getSummary(providerId);
  }

  @Get('expiry/:providerId')
  async getExpiryAnalytics(
    @Param('providerId') providerId: string,
  ): Promise<ExpiryAnalyticsResult> {
    return this.service.getExpiryAnalytics(providerId);
  }

  @Get('stock/:providerId')
  async getStockAnalytics(@Param('providerId') providerId: string): Promise<StockAnalyticsResult> {
    return this.service.getStockAnalytics(providerId);
  }

  @Get('financial/:providerId')
  async getFinancialAnalytics(
    @Param('providerId') providerId: string,
  ): Promise<FinancialAnalyticsResult> {
    return this.service.getFinancialAnalytics(providerId);
  }

  @Get('charts/:providerId')
  async getChartData(@Param('providerId') providerId: string): Promise<ChartDataResult> {
    return this.service.getChartData(providerId);
  }
}
