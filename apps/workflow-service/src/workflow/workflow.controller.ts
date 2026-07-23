import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Headers,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDefinitionDto } from './dto/create-workflow-definition.dto';
import {
  CreateWorkflowInstanceDto,
  ExecuteTransitionDto,
  ApproveInstanceDto,
  CancelInstanceDto,
} from './dto/create-workflow-instance.dto';
import { AuditAction } from './audit-action.decorator';

@ApiTags('Workflows')
@Controller('workflows')
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
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  private extractTenantId(headers: Record<string, string | undefined>): string {
    const tenantId = headers['x-tenant-id'];
    if (!tenantId) {
      throw new NotFoundException('x-tenant-id header is required');
    }
    return tenantId;
  }

  // === Workflow Definitions ===

  @Post('definitions')
  @AuditAction({ action: 'create', resource: 'workflow_definition', captureBody: true })
  @ApiOperation({ summary: 'Create a workflow definition with states and transitions' })
  @ApiResponse({ status: 201, description: 'Workflow definition created' })
  @ApiResponse({ status: 409, description: 'Definition already exists' })
  @ApiResponse({ status: 400, description: 'Invalid state/transition configuration' })
  async createDefinition(
    @Body() dto: CreateWorkflowDefinitionDto,
    @Headers() _headers: Record<string, string | undefined>,
  ) {
    if (!dto.tenantId) {
      dto.tenantId = this.extractTenantId(_headers);
    }
    return this.workflowService.createDefinition(dto);
  }

  @Get('definitions')
  @AuditAction({ action: 'access', resource: 'workflow_definition' })
  @ApiOperation({ summary: 'List workflow definitions for a tenant' })
  @ApiResponse({ status: 200, description: 'Paginated definitions' })
  async findDefinitions(
    @Headers() _headers: Record<string, string | undefined>,
    @Query('entityType') entityType?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const tenantId = this.extractTenantId(_headers);
    return this.workflowService.findDefinitionsByTenant(
      tenantId,
      entityType,
      skip ? parseInt(skip, 10) : undefined,
      take ? parseInt(take, 10) : undefined,
    );
  }

  @Get('definitions/:id')
  @AuditAction({ action: 'access', resource: 'workflow_definition' })
  @ApiOperation({ summary: 'Get a workflow definition by ID' })
  @ApiResponse({ status: 200, description: 'Definition with states and transitions' })
  @ApiResponse({ status: 404, description: 'Definition not found' })
  async findDefinitionById(@Param('id') id: string) {
    return this.workflowService.findDefinitionById(id);
  }

  @Patch('definitions/:id/suspend')
  @AuditAction({ action: 'update', resource: 'workflow_definition' })
  @ApiOperation({ summary: 'Suspend a workflow definition' })
  @ApiResponse({ status: 200, description: 'Definition suspended' })
  @ApiResponse({ status: 404, description: 'Definition not found' })
  async suspendDefinition(
    @Param('id') id: string,
    @Headers() _headers: Record<string, string | undefined>,
  ) {
    const tenantId = this.extractTenantId(_headers);
    return this.workflowService.suspendDefinition({ definitionId: id, tenantId });
  }

  @Patch('definitions/:id/reactivate')
  @AuditAction({ action: 'update', resource: 'workflow_definition' })
  @ApiOperation({ summary: 'Reactivate a workflow definition' })
  @ApiResponse({ status: 200, description: 'Definition reactivated' })
  @ApiResponse({ status: 404, description: 'Definition not found' })
  async reactivateDefinition(
    @Param('id') id: string,
    @Headers() _headers: Record<string, string | undefined>,
  ) {
    const tenantId = this.extractTenantId(_headers);
    return this.workflowService.reactivateDefinition({ definitionId: id, tenantId });
  }

  @Patch('definitions/:id/archive')
  @AuditAction({ action: 'update', resource: 'workflow_definition' })
  @ApiOperation({ summary: 'Archive a workflow definition' })
  @ApiResponse({ status: 200, description: 'Definition archived' })
  @ApiResponse({ status: 404, description: 'Definition not found' })
  async archiveDefinition(
    @Param('id') id: string,
    @Headers() _headers: Record<string, string | undefined>,
  ) {
    const tenantId = this.extractTenantId(_headers);
    return this.workflowService.archiveDefinition({ definitionId: id, tenantId });
  }

  // === Workflow Instances ===

  @Post('instances')
  @AuditAction({ action: 'create', resource: 'workflow_instance', captureBody: true })
  @ApiOperation({ summary: 'Start a new workflow instance for an entity' })
  @ApiResponse({ status: 201, description: 'Workflow instance created' })
  @ApiResponse({ status: 404, description: 'Workflow definition not found' })
  @ApiResponse({ status: 409, description: 'Active instance already exists' })
  async startInstance(
    @Body() dto: CreateWorkflowInstanceDto,
    @Headers() _headers: Record<string, string | undefined>,
  ) {
    if (!dto.tenantId) {
      dto.tenantId = this.extractTenantId(_headers);
    }
    return this.workflowService.startInstance(dto);
  }

  @Get('instances')
  @AuditAction({ action: 'access', resource: 'workflow_instance' })
  @ApiOperation({ summary: 'List workflow instances for a tenant' })
  @ApiResponse({ status: 200, description: 'Paginated instances' })
  async findInstances(
    @Headers() _headers: Record<string, string | undefined>,
    @Query('status') status?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const tenantId = this.extractTenantId(_headers);
    if (entityType && entityId) {
      return this.workflowService.findInstancesByEntity(tenantId, entityType, entityId);
    }
    return this.workflowService.findInstancesByTenant(
      tenantId,
      status,
      skip ? parseInt(skip, 10) : undefined,
      take ? parseInt(take, 10) : undefined,
    );
  }

  @Get('instances/:id')
  @AuditAction({ action: 'access', resource: 'workflow_instance' })
  @ApiOperation({ summary: 'Get a workflow instance by ID' })
  @ApiResponse({ status: 200, description: 'Instance with approvals' })
  @ApiResponse({ status: 404, description: 'Instance not found' })
  async findInstanceById(@Param('id') id: string) {
    return this.workflowService.findInstanceById(id);
  }

  @Patch('instances/:id/cancel')
  @AuditAction({ action: 'update', resource: 'workflow_instance' })
  @ApiOperation({ summary: 'Cancel a workflow instance' })
  @ApiResponse({ status: 200, description: 'Instance cancelled' })
  @ApiResponse({ status: 404, description: 'Instance not found' })
  async cancelInstance(
    @Param('id') id: string,
    @Body() dto: CancelInstanceDto,
    @Headers() _headers: Record<string, string | undefined>,
  ) {
    if (!dto.instanceId) {
      dto.instanceId = id;
    }
    return this.workflowService.cancelInstance(dto);
  }

  // === Dynamic Approval Engine ===

  @Post('instances/:id/execute')
  @AuditAction({ action: 'create', resource: 'workflow_approval', captureBody: true })
  @ApiOperation({ summary: 'Execute a transition on a workflow instance' })
  @ApiResponse({ status: 201, description: 'Transition executed' })
  @ApiResponse({ status: 400, description: 'Invalid transition or threshold not met' })
  @ApiResponse({ status: 404, description: 'Instance not found' })
  async executeTransition(
    @Param('id') id: string,
    @Body() dto: ExecuteTransitionDto,
    @Headers() _headers: Record<string, string | undefined>,
  ) {
    if (!dto.instanceId) {
      dto.instanceId = id;
    }
    return this.workflowService.executeTransition(dto);
  }

  @Post('instances/:id/approve')
  @AuditAction({ action: 'create', resource: 'workflow_approval', captureBody: true })
  @ApiOperation({ summary: 'Approve or reject a workflow instance' })
  @ApiResponse({ status: 201, description: 'Approval decision recorded' })
  @ApiResponse({ status: 400, description: 'Invalid action or threshold not met' })
  @ApiResponse({ status: 404, description: 'Instance not found' })
  async approveInstance(
    @Param('id') id: string,
    @Body() dto: ApproveInstanceDto,
    @Headers() _headers: Record<string, string | undefined>,
  ) {
    if (!dto.instanceId) {
      dto.instanceId = id;
    }
    return this.workflowService.approveInstance(dto);
  }

  // === Approval Queries ===

  @Get('instances/:id/approvals')
  @AuditAction({ action: 'access', resource: 'workflow_approval' })
  @ApiOperation({ summary: 'Get all approvals for a workflow instance' })
  @ApiResponse({ status: 200, description: 'List of approvals' })
  @ApiResponse({ status: 404, description: 'Instance not found' })
  async findApprovals(@Param('id') id: string) {
    return this.workflowService.findApprovals(id);
  }

  @Get('instances/:id/pending-approvals')
  @AuditAction({ action: 'access', resource: 'workflow_approval' })
  @ApiOperation({ summary: 'Get pending approvals for a workflow instance' })
  @ApiResponse({ status: 200, description: 'List of pending approvals' })
  @ApiResponse({ status: 404, description: 'Instance not found' })
  async findPendingApprovals(@Param('id') id: string) {
    return this.workflowService.findPendingApprovals(id);
  }
}
