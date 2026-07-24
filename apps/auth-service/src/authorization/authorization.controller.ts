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
  PermissionResponseDto,
  RoleListResponseDto,
  RoleResponseDto,
} from './dto/authorization-response.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
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
}
