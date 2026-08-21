import { ApiProperty } from '@nestjs/swagger';

export type PublicAvailabilityState = 'IN_STOCK' | 'OUT_OF_STOCK';

export class PublicMedicineSearchResultDto {
  @ApiProperty({ format: 'uuid', description: 'Opaque product reference' })
  productId!: string;

  @ApiProperty({ format: 'uuid', description: 'Opaque provider reference' })
  providerId!: string;

  @ApiProperty()
  providerName!: string;

  @ApiProperty()
  providerCity!: string;

  @ApiProperty()
  providerState!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ required: false, nullable: true })
  genericName!: string | null;

  @ApiProperty()
  brand!: string;

  @ApiProperty()
  strength!: string;

  @ApiProperty()
  dosageForm!: string;

  @ApiProperty()
  requiresPrescription!: boolean;

  @ApiProperty({ enum: ['IN_STOCK', 'OUT_OF_STOCK'] })
  availability!: PublicAvailabilityState;
}

export class PublicMedicineSearchResponseDto {
  @ApiProperty({ type: PublicMedicineSearchResultDto, isArray: true })
  data!: PublicMedicineSearchResultDto[];

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}
