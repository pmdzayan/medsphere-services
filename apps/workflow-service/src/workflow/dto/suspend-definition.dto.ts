import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SuspendDefinitionDto {
  @ApiProperty({ description: 'Workflow definition ID' })
  @IsUUID()
  @IsNotEmpty()
  definitionId!: string;

  @ApiProperty({ description: 'Tenant ID (from x-tenant-id header)' })
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;
}
