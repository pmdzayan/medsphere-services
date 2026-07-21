import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { CreateClaimDto } from './dto/create-claim.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  // ---- Accounts ----

  @Post('accounts')
  async createAccount(@Body() dto: CreateAccountDto) {
    return this.service.createAccount(dto);
  }

  @Get('accounts')
  async findAccountsByTenant(@Query('tenantId') tenantId: string) {
    return this.service.findAccountsByTenant(tenantId);
  }

  // ---- Invoices ----

  @Post('invoices')
  async createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.service.createInvoice(dto);
  }

  @Get('invoices')
  async findInvoicesByTenant(
    @Query('tenantId') tenantId: string,
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findInvoicesByTenant(tenantId, {
      patientId,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('invoices/:id')
  async findInvoiceById(@Param('id') id: string) {
    return this.service.findInvoiceById(id);
  }

  @Post('invoices/:id/issue')
  async issueInvoice(@Param('id') id: string) {
    return this.service.issueInvoice(id);
  }

  // ---- Payments ----

  @Post('payments')
  async recordPayment(@Body() dto: RecordPaymentDto) {
    return this.service.recordPayment(dto);
  }

  // ---- Insurance Claims ----

  @Post('claims')
  async createClaim(@Body() dto: CreateClaimDto) {
    return this.service.createClaim(dto);
  }

  @Post('claims/:id/submit')
  async submitClaim(@Param('id') id: string) {
    return this.service.submitClaim(id);
  }

  @Post('claims/:id/adjudicate')
  async adjudicateClaim(
    @Param('id') id: string,
    @Body() dto: { approvedAmount: number; rejectionReason?: string },
  ) {
    return this.service.adjudicateClaim(id, dto.approvedAmount, dto.rejectionReason);
  }
}
