import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantRbacGuard } from '../common/guards/tenant-rbac.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, TenantRbacGuard)
@ApiHeader({
  name: 'x-tenant-id',
  description: 'Tenant ID for tenant-scoped access',
  required: true,
})
@ApiHeader({
  name: 'x-correlation-id',
  description: 'Correlation ID for request tracing',
  required: false,
})
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions({ resource: 'audit', action: 'read' })
  @ApiOperation({ summary: 'List audit log entries with tenant-scoped filtering' })
  @ApiResponse({ status: 200, description: 'Paginated audit log entries' })
  async findAll(
    @CurrentUser() user: { sub: string; tenantId?: string },
    @Query('tenantId') tenantId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.auditService.findAll({
      requestingUserId: user.sub,
      tenantId,
      userId,
      action,
      resource,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      sortBy,
      sortOrder,
    });
  }

  @Get(':id')
  @RequirePermissions({ resource: 'audit', action: 'read' })
  @ApiOperation({ summary: 'Get a single audit log entry by ID' })
  @ApiResponse({ status: 200, description: 'Audit log entry' })
  @ApiResponse({ status: 404, description: 'Audit log not found' })
  async findById(@Param('id') id: string) {
    return this.auditService.findById(id);
  }
}
