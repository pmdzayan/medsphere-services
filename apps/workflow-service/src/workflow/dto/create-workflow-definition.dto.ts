import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { WorkflowStatus } from '../enums';

export class CreateWorkflowStateDto {
  @ApiProperty({ description: 'State code e.g., "DRAFT", "PENDING_LEVEL_1", "APPROVED"' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ description: 'Human-readable state name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Whether this is the initial state', default: false })
  @IsOptional()
  @IsBoolean()
  isInitial?: boolean;

  @ApiPropertyOptional({ description: 'Whether this is a final state', default: false })
  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;

  @ApiPropertyOptional({ description: 'Whether this state requires approval', default: false })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class CreateWorkflowTransitionDto {
  @ApiProperty({ description: 'Source state code' })
  @IsString()
  @IsNotEmpty()
  fromStateCode!: string;

  @ApiProperty({ description: 'Target state code' })
  @IsString()
  @IsNotEmpty()
  toStateCode!: string;

  @ApiProperty({
    description: 'Action trigger e.g., "SUBMIT_FOR_APPROVAL", "APPROVE_L1", "REJECT"',
  })
  @IsString()
  @IsNotEmpty()
  actionName!: string;

  @ApiPropertyOptional({ description: 'RBAC permission string required to execute transition' })
  @IsOptional()
  @IsString()
  requiredPermission?: string;

  @ApiPropertyOptional({ description: 'Role ID required for approval' })
  @IsOptional()
  @IsUUID()
  requiredRoleId?: string;

  @ApiPropertyOptional({ description: 'Optional monetary threshold e.g., > 10000 USD requires L2' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minAmountThreshold?: number;

  @ApiPropertyOptional({ description: 'Approval level', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  approvalLevel?: number;
}

export class CreateWorkflowDefinitionDto {
  @ApiProperty({ description: 'Tenant ID (from x-tenant-id header)' })
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ description: 'Unique workflow code e.g., "PO_HIGH_VALUE_APPROVAL"' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ description: 'Human-readable workflow name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Workflow description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Target entity e.g., "PURCHASE_ORDER", "PRESCRIPTION", "INVOICE"' })
  @IsString()
  @IsNotEmpty()
  entityType!: string;

  @ApiPropertyOptional({
    description: 'Workflow status',
    enum: WorkflowStatus,
    default: WorkflowStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @ApiProperty({ description: 'Workflow states', type: [CreateWorkflowStateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkflowStateDto)
  states!: CreateWorkflowStateDto[];

  @ApiProperty({ description: 'Workflow transitions', type: [CreateWorkflowTransitionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkflowTransitionDto)
  transitions!: CreateWorkflowTransitionDto[];
}
