import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Controller('rbac')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Post('roles')
  @RequirePermissions('admin:create')
  async createRole(@Body() dto: CreateRoleDto) {
    return this.rbacService.createRole(dto);
  }

  @Get('roles')
  @RequirePermissions('admin:read')
  async findAllRoles(@Query('tenantId') tenantId?: string) {
    return this.rbacService.findAllRoles(tenantId);
  }

  @Get('roles/:id')
  @RequirePermissions('admin:read')
  async findRoleById(@Param('id') id: string) {
    return this.rbacService.findRoleById(id);
  }

  @Put('roles/:id')
  @RequirePermissions('admin:update')
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rbacService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions('admin:delete')
  async removeRole(@Param('id') id: string) {
    await this.rbacService.removeRole(id);
    return { message: 'Role deleted successfully' };
  }

  @Post('roles/:roleId/users/:userId')
  @RequirePermissions('admin:update')
  async assignRoleToUser(@Param('roleId') roleId: string, @Param('userId') userId: string) {
    return this.rbacService.assignRoleToUser(roleId, userId);
  }

  @Delete('roles/:roleId/users/:userId')
  @RequirePermissions('admin:update')
  async removeRoleFromUser(@Param('roleId') roleId: string, @Param('userId') userId: string) {
    return this.rbacService.removeRoleFromUser(roleId, userId);
  }

  @Get('users/:userId/roles')
  @RequirePermissions('admin:read')
  async getUserRoles(@Param('userId') userId: string) {
    return this.rbacService.getUserRoles(userId);
  }

  @Get('users/:userId/permissions')
  @RequirePermissions('admin:read')
  async getUserPermissions(@Param('userId') userId: string) {
    return this.rbacService.getUserPermissions(userId);
  }

  @Get('permissions')
  @RequirePermissions('admin:read')
  async listPermissions(@Query('tenantId') tenantId?: string) {
    return this.rbacService.listPermissions(tenantId);
  }
}
