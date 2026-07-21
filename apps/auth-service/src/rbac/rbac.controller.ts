import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantRbacGuard } from '../common/guards/tenant-rbac.guard';

@Controller('rbac')
@UseGuards(JwtAuthGuard, TenantRbacGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Post('roles')
  @RequirePermissions({ resource: 'admin', action: 'create' })
  async createRole(@Body() dto: CreateRoleDto) {
    return this.rbacService.createRole(dto);
  }

  @Get('roles')
  @RequirePermissions({ resource: 'admin', action: 'read' })
  async findAllRoles(@Query('tenantId') tenantId?: string) {
    return this.rbacService.findAllRoles(tenantId);
  }

  @Get('roles/:id')
  @RequirePermissions({ resource: 'admin', action: 'read' })
  async findRoleById(@Param('id') id: string) {
    return this.rbacService.findRoleById(id);
  }

  @Put('roles/:id')
  @RequirePermissions({ resource: 'admin', action: 'update' })
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rbacService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions({ resource: 'admin', action: 'delete' })
  async removeRole(@Param('id') id: string) {
    await this.rbacService.removeRole(id);
    return { message: 'Role deleted successfully' };
  }

  @Post('roles/:roleId/memberships/:membershipId')
  @RequirePermissions({ resource: 'admin', action: 'update' })
  async assignRoleToUser(
    @Param('roleId') roleId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.rbacService.assignRoleToUser(roleId, membershipId);
  }

  @Delete('roles/:roleId/memberships/:membershipId')
  @RequirePermissions({ resource: 'admin', action: 'update' })
  async removeRoleFromUser(
    @Param('roleId') roleId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.rbacService.removeRoleFromUser(roleId, membershipId);
  }

  @Get('memberships/:membershipId/roles')
  @RequirePermissions({ resource: 'admin', action: 'read' })
  async getUserRoles(@Param('membershipId') membershipId: string) {
    return this.rbacService.getUserRoles(membershipId);
  }

  @Get('users/:userId/permissions')
  @RequirePermissions({ resource: 'admin', action: 'read' })
  async getUserPermissions(@Param('userId') userId: string) {
    return this.rbacService.getUserPermissions(userId);
  }

  @Get('permissions')
  @RequirePermissions({ resource: 'admin', action: 'read' })
  async listPermissions() {
    return this.rbacService.listPermissions();
  }
}
