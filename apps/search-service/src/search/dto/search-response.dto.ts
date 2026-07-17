import { Expose, Type } from 'class-transformer';

export enum UnifiedResultType {
  PRODUCT = 'Product',
  PHARMACY = 'Pharmacy',
  HOSPITAL = 'Hospital',
}

export class UnifiedSearchResult {
  @Expose()
  id!: string;

  @Expose()
  type!: UnifiedResultType;

  @Expose()
  name!: string;

  @Expose()
  thumbnail?: string;

  @Expose()
  provider?: string;

  @Expose()
  providerId?: string;

  @Expose()
  availability!: boolean;

  @Expose()
  isVerified!: boolean;

  @Expose()
  price?: number;

  @Expose()
  distance?: number;

  @Expose()
  rating?: number;

  @Expose()
  city?: string;

  @Expose()
  category?: string;
}

export class SearchMeta {
  @Expose()
  total!: number;

  @Expose()
  page!: number;

  @Expose()
  limit!: number;

  @Expose()
  totalPages!: number;

  @Expose()
  query!: string;

  @Expose()
  processingTimeMs!: number;
}

export class SearchResponseDto {
  @Expose()
  @Type(() => UnifiedSearchResult)
  results!: UnifiedSearchResult[];

  @Expose()
  @Type(() => SearchMeta)
  meta!: SearchMeta;

  @Expose()
  aggregations?: Record<string, unknown>;
}
