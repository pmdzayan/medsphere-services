import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PublicAvailabilityState } from './public-medicine-search-response.dto';

export class PublicNearbyMedicineSearchResultDto {
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

  @ApiProperty({ description: 'Distance from the supplied search point in kilometres' })
  distanceKm!: number;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
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

export class PublicNearbyMedicineSearchResponseDto {
  @ApiProperty({ type: PublicNearbyMedicineSearchResultDto, isArray: true })
  data!: PublicNearbyMedicineSearchResultDto[];

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;

  @ApiProperty()
  radiusKm!: number;
}
