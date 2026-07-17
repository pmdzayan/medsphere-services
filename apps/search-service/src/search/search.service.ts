import { Injectable } from '@nestjs/common';
import { SearchRepository, ProductSearchResult, ProviderSearchResult } from './search.repository';
import { SearchQueryDto, SearchEntityType } from './dto/search-query.dto';
import {
  SearchResponseDto,
  UnifiedSearchResult,
  UnifiedResultType,
  SearchMeta,
} from './dto/search-response.dto';

@Injectable()
export class SearchService {
  constructor(private readonly searchRepository: SearchRepository) {}

  /**
   * Performs a unified search across products and providers.
   * Future: Replace with Elasticsearch/OpenSearch multi-index search.
   */
  async search(query: SearchQueryDto): Promise<SearchResponseDto> {
    const startTime = Date.now();

    const results: UnifiedSearchResult[] = [];

    // Determine which entity types to search
    const searchProducts =
      !query.types || query.types.length === 0 || query.types.includes(SearchEntityType.PRODUCT);

    const searchProviders =
      query.types?.includes(SearchEntityType.PHARMACY) ||
      query.types?.includes(SearchEntityType.HOSPITAL) ||
      !query.types ||
      query.types.length === 0;

    let total = 0;

    if (searchProducts) {
      const productResult = await this.searchRepository.searchProducts(query);
      const productResults = this.mapProductResults(productResult.results);
      results.push(...productResults);
      total += productResult.total;
    }

    if (searchProviders) {
      const providerResult = await this.searchRepository.searchProviders(query);
      const providerResults = this.mapProviderResults(providerResult.results);
      results.push(...providerResults);
      total += providerResult.total;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const processingTimeMs = Date.now() - startTime;

    const meta: SearchMeta = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      query: query.query,
      processingTimeMs,
    };

    return {
      results,
      meta,
      aggregations: this.buildAggregations(results),
    };
  }

  /**
   * Maps product search results to unified search result format.
   */
  private mapProductResults(products: ProductSearchResult[]): UnifiedSearchResult[] {
    return products.map((product) => ({
      id: product.id,
      type: UnifiedResultType.PRODUCT,
      name: product.name,
      thumbnail: product.thumbnail,
      provider: product.providerName,
      providerId: product.providerId,
      availability: product.inStock,
      isVerified: product.isVerified ?? false,
      price: product.price,
      distance: product.distance,
      rating: product.rating,
      city: product.city,
      category: product.category,
    }));
  }

  /**
   * Maps provider search results to unified search result format.
   */
  private mapProviderResults(providers: ProviderSearchResult[]): UnifiedSearchResult[] {
    return providers.map((provider) => ({
      id: provider.id,
      type:
        provider.providerType === 'PHARMACY'
          ? UnifiedResultType.PHARMACY
          : UnifiedResultType.HOSPITAL,
      name: provider.businessName,
      provider: provider.businessName,
      providerId: provider.id,
      availability: provider.isActive,
      isVerified: provider.isVerified,
      distance: provider.distance,
      rating: provider.rating,
      city: provider.city,
    }));
  }

  /**
   * Builds aggregation data from search results.
   * Future: Replace with Elasticsearch aggregation buckets.
   */
  private buildAggregations(results: UnifiedSearchResult[]): Record<string, unknown> {
    const typeCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    const cityCounts: Record<string, number> = {};

    for (const result of results) {
      // Count by type
      const typeKey = result.type;
      typeCounts[typeKey] = (typeCounts[typeKey] || 0) + 1;

      // Count by category
      if (result.category) {
        categoryCounts[result.category] = (categoryCounts[result.category] || 0) + 1;
      }

      // Count by city
      if (result.city) {
        cityCounts[result.city] = (cityCounts[result.city] || 0) + 1;
      }
    }

    return {
      types: typeCounts,
      categories: categoryCounts,
      cities: cityCounts,
    };
  }
}
