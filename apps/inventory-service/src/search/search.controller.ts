import { Controller, Get, Query } from '@nestjs/common';
import { SearchService, PaginatedSearchResult } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  async search(
    @Query('query') query?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('genericName') genericName?: string,
    @Query('dosageForm') dosageForm?: string,
    @Query('strength') strength?: string,
    @Query('requiresPrescription') requiresPrescription?: string,
    @Query('availabilityStatus') availabilityStatus?: string,
    @Query('providerId') providerId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PaginatedSearchResult> {
    return this.service.search({
      query,
      category,
      brand,
      genericName,
      dosageForm,
      strength,
      requiresPrescription:
        requiresPrescription !== undefined ? requiresPrescription === 'true' : undefined,
      availabilityStatus,
      providerId,
      sortBy: sortBy as 'relevance' | 'alphabetical' | 'availability' | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
