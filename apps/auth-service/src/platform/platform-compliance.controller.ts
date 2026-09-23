import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DedicatedAuthEndpoint } from '../auth/dedicated-auth-endpoint.decorator';
import { extractRequestMetadata, type MetadataHttpRequest } from '../auth/request-metadata';
import { ComplianceService } from '../compliance/compliance.service';
import {
  EvaluateCompliancePolicyDto,
  ListComplianceLegalHoldsQueryDto,
  ListCompliancePoliciesQueryDto,
  PlaceComplianceLegalHoldDto,
  ReleaseComplianceLegalHoldDto,
  ReviseCompliancePolicyDto,
} from '../compliance/dto/compliance.dto';
import { CurrentPlatformIdentity } from './decorators/current-platform-identity.decorator';
import { RequirePlatformPermissions } from './decorators/require-platform-permissions.decorator';
import { PlatformAuthGuard } from './guards/platform-auth.guard';
import { PlatformPermissionsGuard } from './guards/platform-permissions.guard';
import { PLATFORM_PERMISSIONS } from './platform.constants';
import type { PlatformAuthenticatedIdentity } from './platform.types';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('platform/compliance')
@ApiTags('Platform Compliance')
@ApiBearerAuth()
@DedicatedAuthEndpoint()
@UseGuards(PlatformAuthGuard, PlatformPermissionsGuard)
export class PlatformComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('data-classes')
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.complianceRead)
  @ApiOperation({ summary: 'Read the explicit Task 0045 compliance data-class inventory' })
  @ApiForbiddenResponse({ description: 'Requires platform.compliance.read' })
  dataClasses() {
    return this.compliance.listDataClasses();
  }

  @Get('policies')
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.complianceRead)
  @ApiOperation({ summary: 'Read active platform baseline and optional tenant compliance policies' })
  @ApiForbiddenResponse({ description: 'Requires platform.compliance.read' })
  listPolicies(@Query() query: ListCompliancePoliciesQueryDto) {
    return this.compliance.listPolicies(query);
  }

  @Put('policies/:dataClass')
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.complianceManage)
  @ApiOperation({ summary: 'Create a versioned compliance policy revision' })
  @ApiForbiddenResponse({ description: 'Requires platform.compliance.manage' })
  revisePolicy(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Param('dataClass') dataClass: string,
    @Body() dto: ReviseCompliancePolicyDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.compliance.revisePolicy(
      identity,
      dataClass,
      dto,
      extractRequestMetadata(request),
    );
  }

  @Get('legal-holds')
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.complianceRead)
  @ApiOperation({ summary: 'Read bounded legal-hold status without free-form case details' })
  @ApiForbiddenResponse({ description: 'Requires platform.compliance.read' })
  listLegalHolds(@Query() query: ListComplianceLegalHoldsQueryDto) {
    return this.compliance.listLegalHolds(query);
  }

  @Post('legal-holds')
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.complianceManage)
  @ApiOperation({ summary: 'Place a legal hold for a tenant subject and optional data class' })
  @ApiForbiddenResponse({ description: 'Requires platform.compliance.manage' })
  placeLegalHold(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Body() dto: PlaceComplianceLegalHoldDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.compliance.placeLegalHold(identity, dto, extractRequestMetadata(request));
  }

  @Post('legal-holds/:holdId/release')
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.complianceManage)
  @ApiOperation({ summary: 'Release an active legal hold using optimistic concurrency' })
  @ApiForbiddenResponse({ description: 'Requires platform.compliance.manage' })
  releaseLegalHold(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Param('holdId', uuid) holdId: string,
    @Body() dto: ReleaseComplianceLegalHoldDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.compliance.releaseLegalHold(
      identity,
      holdId,
      dto,
      extractRequestMetadata(request),
    );
  }

  @Post('evaluate')
  @RequirePlatformPermissions(PLATFORM_PERMISSIONS.complianceRead)
  @ApiOperation({
    summary: 'Evaluate purpose/disposition policy and persist immutable decision evidence',
  })
  @ApiForbiddenResponse({ description: 'Requires platform.compliance.read' })
  evaluate(
    @CurrentPlatformIdentity() identity: PlatformAuthenticatedIdentity,
    @Body() dto: EvaluateCompliancePolicyDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.compliance.evaluate(identity, dto, extractRequestMetadata(request));
  }
}
