import { Body, Controller, Get, Header, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { ConsentService } from './consent.service';
import {
  ConsentStatusDto,
  ConsentStatusListResponseDto,
  RecordConsentDto,
} from './dto/consent.dto';

/**
 * Task 0013: self-scoped consent endpoints, matching the existing
 * users.controller.ts me/privacy convention exactly -- resolved
 * entirely from the authenticated identity, never a client-supplied
 * target user/tenant. No PermissionsGuard is applied here for the same
 * reason it is not applied to me/privacy or me/language: this is the
 * caller's own preference data, not an action on another identity, so
 * there is no separate authorization decision to make beyond "is this
 * a real, authenticated session" (already enforced upstream).
 */
@Controller('users/me/consent')
@ApiTags('Current User')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication required' })
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Get()
  @Header('cache-control', 'no-store')
  @ApiOperation({ summary: 'Read the authenticated user current consent status per category' })
  @ApiOkResponse({ type: ConsentStatusListResponseDto })
  async getConsent(
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ): Promise<ConsentStatusListResponseDto> {
    const data = await this.consentService.getConsentStatus(identity.userId);
    return { data };
  }

  @Post()
  @Header('cache-control', 'no-store')
  @ApiOperation({ summary: 'Record a new consent grant or withdrawal event (append-only)' })
  @ApiOkResponse({ type: ConsentStatusDto })
  recordConsent(@CurrentIdentity() identity: AuthenticatedIdentity, @Body() dto: RecordConsentDto) {
    return this.consentService.recordConsent(identity, dto.category, dto.status, dto.source);
  }
}
