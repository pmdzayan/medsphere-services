import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { PatientMedicineSearchQueryDto } from './dto/patient-medicine-search-query.dto';
import { PatientMedicineSearchResponseDto } from './dto/patient-medicine-search-response.dto';
import { PatientMedicineSearchService } from './patient-medicine-search.service';

/**
 * Task 0034 - Patient medicine search surface.
 *
 * Authenticated (JwtAuthGuard, no @PublicEndpoint). No client-supplied
 * identity/tenant selector is ever accepted: the access token is the only
 * authentication and the response is the minimized patient-safe search view.
 *
 * Responses are `Cache-Control: private, no-store` because search results can
 * contain patient-relevant availability context even though no patient
 * identity or precise location is ever stored.
 */
@Controller('patient/medicine-discovery')
@ApiTags('Patient Medicine Search')
@ApiBearerAuth()
export class PatientMedicineSearchController {
  constructor(private readonly searchService: PatientMedicineSearchService) {}

  /**
   * GET /patient/medicine-discovery/search
   *
   * Bounded patient medicine search across verified providers with accepted
   * Task 0025/0026 trust/freshness availability. Optional location: manual
   * city/state fallback or an explicit one-shot precise coordinate search.
   * Search terms and coordinates are never audited or stored.
   */
  @Get('search')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Search medicine availability for the authenticated patient (trust-aware, bounded)',
  })
  @ApiOkResponse({ type: PatientMedicineSearchResponseDto })
  searchMedicine(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query() query: PatientMedicineSearchQueryDto,
  ): Promise<PatientMedicineSearchResponseDto> {
    return this.searchService.search(identity, query);
  }
}
