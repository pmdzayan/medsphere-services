import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { extractRequestMetadata, MetadataHttpRequest } from '../auth/request-metadata';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { PERMISSIONS } from '../authorization/permission.constants';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import {
  CreateFacilityProviderDto,
  CreateProfessionalProviderDto,
  CreateProviderDepartmentDto,
  CreateProviderLocationDto,
  ProviderDepartmentResponseDto,
  ProviderDomainSummaryDto,
  ProviderLocationResponseDto,
  ProviderProfessionalProfileResponseDto,
} from './dto/provider-domain.dto';
import { ProviderDomainService } from './provider-domain.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('provider-domains')
@Controller('provider-domains')
@UseGuards(PermissionsGuard)
export class ProviderDomainController {
  constructor(private readonly providerDomains: ProviderDomainService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.providerOnboardingManage)
  @ApiOperation({ summary: 'List assigned hospital, clinic, laboratory and doctor providers' })
  @ApiOkResponse({ type: [ProviderDomainSummaryDto] })
  list(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.providerDomains.listAssigned(identity);
  }

  @Post('facilities')
  @RequirePermissions(PERMISSIONS.providerOnboardingManage)
  @ApiOperation({
    summary: 'Create an unverified hospital, clinic or laboratory provider for the active tenant',
  })
  @ApiCreatedResponse({ type: ProviderDomainSummaryDto })
  createFacility(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() dto: CreateFacilityProviderDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.providerDomains.createFacility(identity, dto, extractRequestMetadata(request));
  }

  @Post('professionals')
  @RequirePermissions(PERMISSIONS.providerOnboardingManage)
  @ApiOperation({
    summary: 'Create an unverified doctor provider tied to an active tenant membership',
  })
  @ApiCreatedResponse({ type: ProviderDomainSummaryDto })
  createProfessional(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() dto: CreateProfessionalProviderDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.providerDomains.createProfessional(identity, dto, extractRequestMetadata(request));
  }

  @Get(':providerId/locations')
  @RequirePermissions(PERMISSIONS.providerOnboardingManage)
  @ApiOkResponse({ type: [ProviderLocationResponseDto] })
  listLocations(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', uuid) providerId: string,
  ) {
    return this.providerDomains.listLocations(identity, providerId);
  }

  @Post(':providerId/locations')
  @RequirePermissions(PERMISSIONS.providerOnboardingManage)
  @ApiCreatedResponse({ type: ProviderLocationResponseDto })
  createLocation(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', uuid) providerId: string,
    @Body() dto: CreateProviderLocationDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.providerDomains.createLocation(
      identity,
      providerId,
      dto,
      extractRequestMetadata(request),
    );
  }

  @Get(':providerId/departments')
  @RequirePermissions(PERMISSIONS.providerOnboardingManage)
  @ApiOkResponse({ type: [ProviderDepartmentResponseDto] })
  listDepartments(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', uuid) providerId: string,
  ) {
    return this.providerDomains.listDepartments(identity, providerId);
  }

  @Post(':providerId/departments')
  @RequirePermissions(PERMISSIONS.providerOnboardingManage)
  @ApiCreatedResponse({ type: ProviderDepartmentResponseDto })
  createDepartment(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', uuid) providerId: string,
    @Body() dto: CreateProviderDepartmentDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.providerDomains.createDepartment(
      identity,
      providerId,
      dto,
      extractRequestMetadata(request),
    );
  }

  @Get(':providerId/professional-profile')
  @RequirePermissions(PERMISSIONS.providerOnboardingManage)
  @ApiOkResponse({ type: ProviderProfessionalProfileResponseDto })
  getProfessionalProfile(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', uuid) providerId: string,
  ) {
    return this.providerDomains.getProfessionalProfile(identity, providerId);
  }
}
