import { Controller, Get, Header, Query } from '@nestjs/common';
import { PublicEndpoint } from '@medsphere/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicNearbyMedicineSearchQueryDto } from './dto/public-nearby-medicine-search-query.dto';
import { PublicNearbyMedicineSearchResponseDto } from './dto/public-nearby-medicine-search-response.dto';
import { PublicNearbyMedicineSearchService } from './public-nearby-medicine-search.service';

@Controller('public/medicine-discovery')
@ApiTags('Public Medicine Discovery')
export class PublicNearbyMedicineSearchController {
  constructor(private readonly search: PublicNearbyMedicineSearchService) {}

  @Get('nearby')
  @PublicEndpoint()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Find medicine availability at verified providers near a supplied location',
  })
  @ApiOkResponse({ type: PublicNearbyMedicineSearchResponseDto })
  searchNearby(@Query() query: PublicNearbyMedicineSearchQueryDto) {
    return this.search.search(query);
  }
}
