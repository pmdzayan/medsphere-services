import { Body, Controller, Get, Post, Patch, Query } from '@nestjs/common';
import { ProviderVerificationService } from './provider-verification.service';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { ResubmitVerificationDto } from './dto/resubmit-verification.dto';
import { VerificationResponseDto } from './dto/verification-response.dto';

@Controller('provider-verification')
export class ProviderVerificationController {
  constructor(private readonly service: ProviderVerificationService) {}

  @Post('submit')
  async submit(@Body() dto: SubmitVerificationDto): Promise<VerificationResponseDto> {
    // TODO: Extract tenantId from authenticated user context
    const tenantId = '00000000-0000-0000-0000-000000000000';
    return this.service.submit(tenantId, dto);
  }

  @Get('status')
  async getStatus(@Query('id') verificationId: string): Promise<VerificationResponseDto> {
    return this.service.getStatus(verificationId);
  }

  @Patch('resubmit')
  async resubmit(@Body() dto: ResubmitVerificationDto): Promise<VerificationResponseDto> {
    return this.service.resubmit(dto.verificationId, dto);
  }
}
