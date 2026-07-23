import { IsString, IsNotEmpty, IsOptional, IsUUID, IsObject, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkflowInstanceDto {
  @ApiProperty({ description: 'Tenant ID (from x-tenant-id header)' })
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ description: 'Workflow definition code' })
  @IsString()
  @IsNotEmpty()
  workflowCode!: string;

  @ApiProperty({ description: 'Target entity type e.g., "PURCHASE_ORDER"' })
  @IsString()
  @IsNotEmpty()
  entityType!: string;

  @ApiProperty({ description: 'Target entity UUID' })
  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @ApiProperty({ description: 'User ID who initiated the workflow' })
  @IsUUID()
  @IsNotEmpty()
  initiatorId!: string;

  @ApiPropertyOptional({
    description: 'Context metadata e.g. { amount: 15000, department: "Pharmacy" }',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ExecuteTransitionDto {
  @ApiPropertyOptional({ description: 'Workflow instance ID (from URL param)' })
  @IsOptional()
  @IsUUID()
  instanceId?: string;

  @ApiProperty({
    description: 'Action name to execute e.g., "SUBMIT_FOR_APPROVAL", "APPROVE_L1", "REJECT"',
  })
  @IsString()
  @IsNotEmpty()
  actionName!: string;

  @ApiProperty({ description: 'User ID executing the transition' })
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @ApiPropertyOptional({ description: 'Comments for the transition' })
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiPropertyOptional({ description: 'Amount for threshold-based escalation' })
  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;
}

export class ApproveInstanceDto {
  @ApiProperty({ description: 'Workflow instance ID' })
  @IsUUID()
  @IsNotEmpty()
  instanceId!: string;

  @ApiProperty({ description: 'Action name to execute e.g., "APPROVE_L1", "REJECT"' })
  @IsString()
  @IsNotEmpty()
  actionName!: string;

  @ApiProperty({ description: 'User ID of the approver' })
  @IsUUID()
  @IsNotEmpty()
  approverId!: string;

  @ApiPropertyOptional({ description: 'Comments for the approval decision' })
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiPropertyOptional({ description: 'Amount for threshold-based escalation' })
  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;
}

export class CancelInstanceDto {
  @ApiProperty({ description: 'Workflow instance ID' })
  @IsUUID()
  @IsNotEmpty()
  instanceId!: string;

  @ApiProperty({ description: 'User ID cancelling the instance' })
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsOptional()
  @IsString()
  reason?: string;
}
