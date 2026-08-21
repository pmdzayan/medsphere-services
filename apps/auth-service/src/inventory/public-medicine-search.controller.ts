import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { PublicEndpoint } from '@medsphere/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicMedicineSearchQueryDto } from './dto/public-medicine-search-query.dto';
import { PublicMedicineSearchResponseDto } from './dto/public-medicine-search-response.dto';
import { PublicMedicineSearchService } from './public-medicine-search.service';

@Controller('public/providers')
@ApiTags('Public Medicine Search')
export class PublicMedicineSearchController {
  constructor(private readonly search: PublicMedicineSearchService) {}

  /**
   * GET /public/providers/:providerId/medicine-search
   *
   * Unauthenticated, patient-facing medicine availability search for one
   * provider. Never grants provider/staff authority -- read-only, and
   * returns only privacy-safe fields (see PublicMedicineSearchService).
   */
  @Get(':providerId/medicine-search')
  @PublicEndpoint()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Search medicine availability for a provider (patient-safe, public)' })
  @ApiOkResponse({ type: PublicMedicineSearchResponseDto })
  @ApiNotFoundResponse({ description: 'Provider not found or not eligible for public search' })
  searchMedicine(
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Query() query: PublicMedicineSearchQueryDto,
  ) {
    return this.search.search(providerId, query);
  }
}
