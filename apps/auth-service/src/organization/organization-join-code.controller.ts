import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthConfigService } from '../auth/auth-config.service';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { extractRequestMetadata, type MetadataHttpRequest } from '../auth/request-metadata';
import { PERMISSIONS } from '../authorization/permission.constants';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { parseRequiredVersion } from '../authorization/if-match';
import { IssueOrganizationJoinCodeDto } from './dto/issue-organization-join-code.dto';
import { OrganizationOnboardingService } from './organization-onboarding.service';

const uuid = new ParseUUIDPipe({ version: '4' });
const MAX_CODE_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

@Controller('organizations/join-codes')
@ApiTags('Organization join codes')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequirePermissions(PERMISSIONS.organizationJoinCodesManage)
@ApiForbiddenResponse({ description: 'Permission denied' })
export class OrganizationJoinCodeController {
  constructor(
    private readonly onboarding: OrganizationOnboardingService,
    private readonly authConfig: AuthConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List join-code metadata for the authenticated tenant' })
  @ApiOkResponse()
  list(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.onboarding.listJoinCodes(identity);
  }

  @Post()
  @ApiOperation({ summary: 'Issue a tenant join code; plaintext is returned once' })
  @ApiCreatedResponse()
  issue(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() dto: IssueOrganizationJoinCodeDto,
    @Req() request: MetadataHttpRequest,
  ) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (
      expiresAt &&
      (expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + MAX_CODE_LIFETIME_MS)
    ) {
      throw new BadRequestException('Join-code expiry must be within the next year');
    }
    return this.onboarding.issueJoinCode(
      identity,
      expiresAt,
      this.authConfig.value.orgJoinCodePepper,
      extractRequestMetadata(request),
    );
  }

  @Delete(':joinCodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a join code using a strong version precondition' })
  @ApiNoContentResponse()
  async revoke(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('joinCodeId', uuid) joinCodeId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: MetadataHttpRequest,
  ): Promise<void> {
    await this.onboarding.revokeJoinCode(
      identity,
      joinCodeId,
      parseRequiredVersion(ifMatch),
      extractRequestMetadata(request),
    );
  }
}
