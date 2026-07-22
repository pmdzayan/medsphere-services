import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { SendNotificationDto } from './dto/send-notification.dto';

@ApiTags('Notifications')
@Controller('notifications')
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
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // === Templates ===

  @Post('templates')
  @ApiOperation({ summary: 'Create a notification template' })
  @ApiResponse({ status: 201, description: 'Template created' })
  @ApiResponse({ status: 409, description: 'Template already exists' })
  async createTemplate(@Body() dto: CreateTemplateDto) {
    return this.notificationService.createTemplate(dto);
  }

  @Get('templates')
  @ApiOperation({ summary: 'List notification templates for a tenant' })
  @ApiResponse({ status: 200, description: 'Paginated templates' })
  async findTemplates(
    @Query('tenantId') tenantId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.notificationService.findTemplatesByTenant(
      tenantId,
      skip ? parseInt(skip, 10) : undefined,
      take ? parseInt(take, 10) : undefined,
    );
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get a single template by ID' })
  @ApiResponse({ status: 200, description: 'Template' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findTemplateById(@Param('id') id: string) {
    return this.notificationService.findTemplateById(id);
  }

  @Put('templates/:id')
  @ApiOperation({ summary: 'Update a notification template' })
  @ApiResponse({ status: 200, description: 'Updated template' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.notificationService.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: 'Delete a notification template' })
  @ApiResponse({ status: 200, description: 'Template deleted' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async deleteTemplate(@Param('id') id: string) {
    await this.notificationService.deleteTemplate(id);
    return { message: 'Template deleted successfully' };
  }

  // === Configs ===

  @Post('configs')
  @ApiOperation({ summary: 'Create a tenant notification config' })
  @ApiResponse({ status: 201, description: 'Config created' })
  async createConfig(@Body() dto: CreateConfigDto) {
    return this.notificationService.createConfig(dto);
  }

  @Get('configs')
  @ApiOperation({ summary: 'List notification configs for a tenant' })
  @ApiResponse({ status: 200, description: 'Configs' })
  async findConfigs(@Query('tenantId') tenantId: string) {
    return this.notificationService.findConfigsByTenant(tenantId);
  }

  @Put('configs/:id')
  @ApiOperation({ summary: 'Update a notification config' })
  @ApiResponse({ status: 200, description: 'Updated config' })
  @ApiResponse({ status: 404, description: 'Config not found' })
  async updateConfig(@Param('id') id: string, @Body() dto: UpdateConfigDto) {
    return this.notificationService.updateConfig(id, dto);
  }

  @Delete('configs/:id')
  @ApiOperation({ summary: 'Delete a notification config' })
  @ApiResponse({ status: 200, description: 'Config deleted' })
  @ApiResponse({ status: 404, description: 'Config not found' })
  async deleteConfig(@Param('id') id: string) {
    await this.notificationService.deleteConfig(id);
    return { message: 'Config deleted successfully' };
  }

  // === Send ===

  @Post('send')
  @ApiOperation({ summary: 'Send a notification directly' })
  @ApiResponse({ status: 201, description: 'Notification sent' })
  async sendNotification(@Body() dto: SendNotificationDto) {
    return this.notificationService.sendNotification(dto);
  }

  // === Logs ===

  @Get('logs')
  @ApiOperation({ summary: 'List notification logs for a tenant' })
  @ApiResponse({ status: 200, description: 'Paginated logs' })
  async findLogs(
    @Query('tenantId') tenantId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.notificationService.findLogsByTenant(
      tenantId,
      skip ? parseInt(skip, 10) : undefined,
      take ? parseInt(take, 10) : undefined,
    );
  }
}
