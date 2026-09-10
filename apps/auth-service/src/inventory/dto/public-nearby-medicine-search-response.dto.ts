import { ApiProperty } from '@nestjs/swagger';
import { PublicMedicineSearchResultDto } from './public-medicine-search-response.dto';

export class PublicNearbyMedicineSearchResultDto extends PublicMedicineSearchResultDto {
  @ApiProperty({ description: 'Distance from the supplied search point in kilometres' })
  distanceKm!: number;
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
