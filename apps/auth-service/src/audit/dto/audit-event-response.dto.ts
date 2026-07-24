import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  eventType!: string;

  @ApiProperty({ enum: ['SUCCEEDED', 'DENIED', 'FAILED'] })
  outcome!: 'SUCCEEDED' | 'DENIED' | 'FAILED';

  @ApiPropertyOptional({ format: 'uuid' })
  actorMembershipId!: string | null;

  @ApiPropertyOptional()
  resourceType!: string | null;

  @ApiPropertyOptional()
  resourceId!: string | null;

  @ApiPropertyOptional()
  requestId!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata!: Record<string, string | number | boolean | null>;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;
}

export class AuditEventListResponseDto {
  @ApiProperty({ type: [AuditEventResponseDto] })
  data!: AuditEventResponseDto[];

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  nextCursor!: string | null;
}
