import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicEndpoint } from '@medsphere/common';
import { AccountVerificationService } from './account-verification.service';
import { CompleteMockVerificationDto } from './dto/complete-mock-verification.dto';

@Controller('account-verification')
@ApiTags('Account verification')
export class VerificationController {
  constructor(private readonly verification: AccountVerificationService) {}

  @Post('mock/complete')
  @PublicEndpoint()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete synthetic verification in non-production test environments only',
  })
  @ApiOkResponse({ description: 'Synthetic verification result applied' })
  @ApiNotFoundResponse({ description: 'Test verification provider is disabled' })
  completeMock(@Body() dto: CompleteMockVerificationDto) {
    return this.verification.completeMockVerification(dto);
  }
}
