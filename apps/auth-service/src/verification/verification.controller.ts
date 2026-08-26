import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicEndpoint } from '@medsphere/common';
import { AccountVerificationService } from './account-verification.service';
import { CompleteMockVerificationDto } from './dto/complete-mock-verification.dto';
import { RequestPhoneOtpDto } from './otp/dto/request-phone-otp.dto';
import { VerifyPhoneOtpDto } from './otp/dto/verify-phone-otp.dto';
import { PhoneOtpService } from './otp/phone-otp.service';

@Controller('account-verification')
@ApiTags('Account verification')
export class VerificationController {
  constructor(
    private readonly verification: AccountVerificationService,
    private readonly phoneOtp: PhoneOtpService,
  ) {}

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

  /**
   * Rate limiting for this route (1/min per account) is enforced by the
   * 'otp-request' named throttler registered in AuthRateLimitModule,
   * scoped to this exact handler name -- see skipUnlessHandler there.
   */
  @Post('phone/otp/request')
  @PublicEndpoint()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a phone verification OTP' })
  @ApiOkResponse({ description: 'Generic acknowledgement, non-enumerating' })
  requestPhoneOtp(@Body() dto: RequestPhoneOtpDto) {
    return this.phoneOtp.requestOtp(dto);
  }

  /**
   * Rate limiting for this route (10/min per account) is enforced by the
   * 'otp-verify' named throttler registered in AuthRateLimitModule, scoped
   * to this exact handler name -- see skipUnlessHandler there.
   */
  @Post('phone/otp/verify')
  @PublicEndpoint()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a phone verification OTP' })
  @ApiOkResponse({ description: 'Verification outcome, including activation status' })
  verifyPhoneOtp(@Body() dto: VerifyPhoneOtpDto) {
    return this.phoneOtp.verifyOtp(dto);
  }
}
