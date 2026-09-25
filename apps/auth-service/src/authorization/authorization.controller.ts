import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPreconditionFailedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { extractRequestMetadata, MetadataHttpRequest } from '../auth/request-metadata';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { AuthorizationService } from './authorization.service';
import { AuthorizationListQueryDto } from './dto/authorization-list-query.dto';
import {
  AssignmentResponseDto,
  MembershipListResponseDto,
  PermissionResponseDto,
  RoleListResponseDto,
  RoleResponseDto,
  ProviderAccessResponseDto,
  ProviderStaffListResponseDto,
  ProviderScopeResponseDto,
  ProviderLocationAccessResponseDto,
  ProviderDepartmentAccessResponseDto,
} from './dto/authorization-response.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateMembershipStatusDto } from './dto/update-membership-status.dto';
import { parseRequiredVersion } from './if-match';
import { PERMISSIONS } from './permission.constants';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './require-permissions.decorator';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('authorization')
@ApiTags('Authorization')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@ApiForbiddenResponse({ description: 'Permission denied' })
export class AuthorizationController {
  constructor(private readonly authorizationService: AuthorizationService) {}

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.permissionsRead)
  @ApiOperation({ summary: 'List the migration-owned permission catalogue' })
  @ApiOkResponse({ type: [PermissionResponseDto] })
  listPermissions() {
    return this.authorizationService.listPermissions();
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.rolesRead)
  @ApiOperation({ summary: 'List roles in the authenticated tenant' })
  @ApiOkResponse({ type: RoleListResponseDto })
  listRoles(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query() query: AuthorizationListQueryDto,
  ) {
    return this.authorizationService.listRoles(identity, query);
  }

  @Post('roles')
  @RequirePermissions(PERMISSIONS.rolesCreate)
  @ApiOperation({ summary: 'Create a custom role in the authenticated tenant' })
  @ApiCreatedResponse({ type: RoleResponseDto })
  @ApiConflictResponse({ description: 'Role name already exists or is reserved' })
  createRole(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() dto: CreateRoleDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authorizationService.createRole(identity, dto, extractRequestMetadata(request));
  }

  @Get('roles/:roleId')
  @RequirePermissions(PERMISSIONS.rolesRead)
  @ApiOperation({ summary: 'Read one role in the authenticated tenant' })
  @ApiOkResponse({ type: RoleResponseDto })
  findRole(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('roleId', uuid) roleId: string,
  ) {
    return this.authorizationService.findRole(identity, roleId);
  }

  @Patch('roles/:roleId')
  @RequirePermissions(PERMISSIONS.rolesUpdate)
  @ApiOperation({ summary: 'Update a custom tenant role using a strong version precondition' })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiPreconditionFailedResponse({ description: 'Role version is stale' })
  updateRole(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('roleId', uuid) roleId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: UpdateRoleDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authorizationService.updateRole(
      identity,
      roleId,
      parseRequiredVersion(ifMatch),
      dto,
      extractRequestMetadata(request),
    );
  }

  @Delete('roles/:roleId')
  @RequirePermissions(PERMISSIONS.rolesDelete)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a custom tenant role using a strong version precondition' })
  @ApiNoContentResponse()
  @ApiPreconditionFailedResponse({ description: 'Role version is stale' })
  async deleteRole(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('roleId', uuid) roleId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: MetadataHttpRequest,
  ): Promise<void> {
    await this.authorizationService.deleteRole(
      identity,
      roleId,
      parseRequiredVersion(ifMatch),
      extractRequestMetadata(request),
    );
  }

  @Get('memberships/:membershipId/roles')
  @RequirePermissions(PERMISSIONS.assignmentsRead)
  @ApiOperation({ summary: 'List role assignments for one membership in the active tenant' })
  @ApiOkResponse({ type: [AssignmentResponseDto] })
  listAssignments(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('membershipId', uuid) membershipId: string,
  ) {
    return this.authorizationService.listMembershipRoles(identity, membershipId);
  }

  @Get('memberships')
  @RequirePermissions(PERMISSIONS.assignmentsRead)
  @ApiOperation({ summary: 'List memberships and role assignments in the authenticated tenant' })
  @ApiOkResponse({ type: MembershipListResponseDto })
  listMemberships(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query() query: AuthorizationListQueryDto,
  ) {
    return this.authorizationService.listMemberships(identity, query);
  }

  @Put('memberships/:membershipId/roles/:roleId')
  @RequirePermissions(PERMISSIONS.assignmentsManage)
  @ApiOperation({ summary: 'Idempotently assign a tenant role to a tenant membership' })
  @ApiOkResponse({ type: AssignmentResponseDto })
  addAssignment(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('membershipId', uuid) membershipId: string,
    @Param('roleId', uuid) roleId: string,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authorizationService.addAssignment(
      identity,
      membershipId,
      roleId,
      extractRequestMetadata(request),
    );
  }

  @Delete('memberships/:membershipId/roles/:roleId')
  @RequirePermissions(PERMISSIONS.assignmentsManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a role assignment without removing the last tenant administrator',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'The last active tenant administrator cannot be removed' })
  async removeAssignment(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('membershipId', uuid) membershipId: string,
    @Param('roleId', uuid) roleId: string,
    @Req() request: MetadataHttpRequest,
  ): Promise<void> {
    await this.authorizationService.removeAssignment(
      identity,
      membershipId,
      roleId,
      extractRequestMetadata(request),
    );
  }

  @Get('memberships/:membershipId/provider-access')
  @RequirePermissions(PERMISSIONS.providerAccessRead)
  @ApiOperation({ summary: 'List provider assignments for one tenant membership' })
  @ApiOkResponse({ type: [ProviderAccessResponseDto] })
  listProviderAccess(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('membershipId', uuid) membershipId: string,
  ) {
    return this.authorizationService.listProviderAccess(identity, membershipId);
  }

  @Get('providers/:providerId/memberships')
  @RequirePermissions(PERMISSIONS.providerAccessRead)
  @ApiOperation({ summary: 'List bounded staff assignments for one provider' })
  @ApiOkResponse({ type: ProviderStaffListResponseDto })
  listProviderMembers(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', uuid) providerId: string,
    @Query() query: AuthorizationListQueryDto,
  ) {
    return this.authorizationService.listProviderMembers(identity, providerId, query);
  }

  @Put('memberships/:membershipId/provider-access/:providerId')
  @RequirePermissions(PERMISSIONS.providerAccessManage)
  @ApiOperation({ summary: 'Idempotently assign a provider to a tenant membership' })
  @ApiOkResponse({ type: ProviderAccessResponseDto })
  addProviderAccess(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('membershipId', uuid) membershipId: string,
    @Param('providerId', uuid) providerId: string,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authorizationService.addProviderAccess(
      identity,
      membershipId,
      providerId,
      extractRequestMetadata(request),
    );
  }

  @Delete('memberships/:membershipId/provider-access/:providerId')
  @RequirePermissions(PERMISSIONS.providerAccessManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a provider assignment from a tenant membership' })
  @ApiNoContentResponse()
  async removeProviderAccess(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('membershipId', uuid) membershipId: string,
    @Param('providerId', uuid) providerId: string,
    @Req() request: MetadataHttpRequest,
  ): Promise<void> {
    await this.authorizationService.removeProviderAccess(
      identity,
      membershipId,
      providerId,
      extractRequestMetadata(request),
    );
  }

  @Get('memberships/:membershipId/provider-access/:providerId/scopes')
  @RequirePermissions(PERMISSIONS.providerAccessRead)
  @ApiOperation({
    summary: 'List active location and department scopes for one provider assignment',
  })
  @ApiOkResponse({ type: ProviderScopeResponseDto })
  listProviderScopes(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('membershipId', uuid) membershipId: string,
    @Param('providerId', uuid) providerId: string,
  ) {
    return this.authorizationService.listProviderScopes(identity, membershipId, providerId);
  }

  @Put('memberships/:membershipId/provider-access/:providerId/locations/:locationId')
  @RequirePermissions(PERMISSIONS.providerAccessManage)
  @ApiOperation({ summary: 'Idempotently assign an active provider location scope' })
  @ApiOkResponse({ type: ProviderLocationAccessResponseDto })
  addProviderLocationAccess(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('membershipId', uuid) membershipId: string,
    @Param('providerId', uuid) providerId: string,
    @Param('locationId', uuid) locationId: string,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authorizationService.addProviderLocationAccess(
      identity,
      membershipId,
      providerId,
      locationId,
      extractRequestMetadata(request),
    );
  }

  @Delete('memberships/:membershipId/provider-access/:providerId/locations/:locationId')
  @RequirePermissions(PERMISSIONS.providerAccessManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a provider location scope' })
  @ApiNoContentResponse()
  async removeProviderLocationAccess(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('membershipId', uuid) membershipId: string,
    @Param('providerId', uuid) providerId: string,
    @Param('locationId', uuid) locationId: string,
    @Req() request: MetadataHttpRequest,
  ): Promise<void> {
    await this.authorizationService.removeProviderLocationAccess(
      identity,
      membershipId,
      providerId,
      locationId,
      extractRequestMetadata(request),
    );
  }

  @Put('memberships/:membershipId/provider-access/:providerId/departments/:departmentId')
  @RequirePermissions(PERMISSIONS.providerAccessManage)
  @ApiOperation({ summary: 'Idempotently assign an active provider department scope' })
  @ApiOkResponse({ type: ProviderDepartmentAccessResponseDto })
  addProviderDepartmentAccess(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('membershipId', uuid) membershipId: string,
    @Param('providerId', uuid) providerId: string,
    @Param('departmentId', uuid) departmentId: string,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authorizationService.addProviderDepartmentAccess(
      identity,
      membershipId,
      providerId,
      departmentId,
      extractRequestMetadata(request),
    );
  }

  @Delete('memberships/:membershipId/provider-access/:providerId/departments/:departmentId')
  @RequirePermissions(PERMISSIONS.providerAccessManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a provider department scope' })
  @ApiNoContentResponse()
  async removeProviderDepartmentAccess(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('membershipId', uuid) membershipId: string,
    @Param('providerId', uuid) providerId: string,
    @Param('departmentId', uuid) departmentId: string,
    @Req() request: MetadataHttpRequest,
  ): Promise<void> {
    await this.authorizationService.removeProviderDepartmentAccess(
      identity,
      membershipId,
      providerId,
      departmentId,
      extractRequestMetadata(request),
    );
  }

  @Patch('memberships/:membershipId/status')
  @RequirePermissions(PERMISSIONS.membershipsManage)
  @ApiOperation({
    summary: 'Suspend or revoke a staff membership and immediately invalidate its sessions',
  })
  @ApiOkResponse({ description: 'Membership status updated successfully' })
  @ApiConflictResponse({
    description: 'Target membership is not active, or is the last active tenant administrator',
  })
  updateMembershipStatus(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('membershipId', uuid) membershipId: string,
    @Body() dto: UpdateMembershipStatusDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.authorizationService.updateMembershipStatus(
      identity,
      membershipId,
      dto,
      extractRequestMetadata(request),
    );
  }
}
