import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  COMPLIANCE_DATA_CLASSES,
  COMPLIANCE_DISPOSITIONS,
  COMPLIANCE_EVALUATION_CONTEXTS,
  COMPLIANCE_LEGAL_HOLD_REASONS,
  COMPLIANCE_LEGAL_HOLD_STATUSES,
  COMPLIANCE_PURPOSES,
  type ComplianceDataClass,
  type ComplianceDisposition,
  type ComplianceEvaluationContext,
  type ComplianceLegalHoldReason,
  type ComplianceLegalHoldStatus,
  type CompliancePurpose,
} from '../compliance.types';

export class ReviseCompliancePolicyDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Omit for the platform baseline policy' })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;

  @ApiProperty({ enum: COMPLIANCE_PURPOSES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(COMPLIANCE_PURPOSES, { each: true })
  allowedPurposes!: CompliancePurpose[];

  @ApiPropertyOptional({ minimum: 1, maximum: 36500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36500)
  retentionDays?: number;

  @ApiProperty({ enum: COMPLIANCE_DISPOSITIONS })
  @IsIn(COMPLIANCE_DISPOSITIONS)
  expiryDisposition!: ComplianceDisposition;

  @ApiProperty({ enum: COMPLIANCE_DISPOSITIONS })
  @IsIn(COMPLIANCE_DISPOSITIONS)
  subjectRequestDisposition!: ComplianceDisposition;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  policyReference!: string;

  @ApiPropertyOptional({
    minimum: 0,
    description: '0 for first creation; current version for a revision',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class ListCompliancePoliciesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;
}

export class PlaceComplianceLegalHoldDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  subjectUserId!: string;

  @ApiPropertyOptional({
    enum: COMPLIANCE_DATA_CLASSES,
    description: 'Omit to cover all data classes',
  })
  @IsOptional()
  @IsIn(COMPLIANCE_DATA_CLASSES)
  dataClass?: ComplianceDataClass;

  @ApiProperty({ enum: COMPLIANCE_LEGAL_HOLD_REASONS })
  @IsIn(COMPLIANCE_LEGAL_HOLD_REASONS)
  reasonCode!: ComplianceLegalHoldReason;

  @ApiPropertyOptional({
    description: 'Optional lower-case SHA-256 digest of an external case/reference identifier',
  })
  @IsOptional()
  @Matches(/^[0-9a-f]{64}$/)
  referenceHash?: string;

  @ApiProperty({ minLength: 8, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;
}

export class ReleaseComplianceLegalHoldDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ListComplianceLegalHoldsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  subjectUserId?: string;

  @ApiPropertyOptional({ enum: COMPLIANCE_LEGAL_HOLD_STATUSES })
  @IsOptional()
  @IsIn(COMPLIANCE_LEGAL_HOLD_STATUSES)
  status?: ComplianceLegalHoldStatus;
}

export class EvaluateCompliancePolicyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  subjectUserId!: string;

  @ApiProperty({ enum: COMPLIANCE_DATA_CLASSES })
  @IsIn(COMPLIANCE_DATA_CLASSES)
  dataClass!: ComplianceDataClass;

  @ApiProperty({ enum: COMPLIANCE_PURPOSES })
  @IsIn(COMPLIANCE_PURPOSES)
  purpose!: CompliancePurpose;

  @ApiProperty({ enum: COMPLIANCE_EVALUATION_CONTEXTS })
  @IsIn(COMPLIANCE_EVALUATION_CONTEXTS)
  context!: ComplianceEvaluationContext;

  @ApiPropertyOptional({ enum: COMPLIANCE_DISPOSITIONS })
  @IsOptional()
  @IsIn(COMPLIANCE_DISPOSITIONS)
  requestedDisposition?: ComplianceDisposition;
}

export class RequestComplianceDispositionDto {
  @ApiProperty({ enum: COMPLIANCE_DATA_CLASSES })
  @IsIn(COMPLIANCE_DATA_CLASSES)
  dataClass!: ComplianceDataClass;

  @ApiProperty({ enum: COMPLIANCE_DISPOSITIONS })
  @IsIn(COMPLIANCE_DISPOSITIONS)
  requestedDisposition!: ComplianceDisposition;

  @ApiProperty({ minLength: 8, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;
}

export class ListSubjectDispositionJobsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
