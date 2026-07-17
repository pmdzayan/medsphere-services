import { IsOptional, IsString, IsEnum, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum SearchEntityType {
  PRODUCT = 'PRODUCT',
  PHARMACY = 'PHARMACY',
  HOSPITAL = 'HOSPITAL',
}

export enum ProductCategoryFilter {
  MEDICINE = 'MEDICINE',
  OTC = 'OTC',
  COSMETIC = 'COSMETIC',
  AYURVEDIC = 'AYURVEDIC',
  SUPPLEMENT = 'SUPPLEMENT',
  MEDICAL_DEVICE = 'MEDICAL_DEVICE',
}

export enum SearchSortBy {
  RELEVANCE = 'RELEVANCE',
  DISTANCE = 'DISTANCE',
  PRICE = 'PRICE',
  RATING = 'RATING',
  AVAILABILITY = 'AVAILABILITY',
}

export class SearchQueryDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsEnum(SearchEntityType, { each: true })
  @Type(() => String)
  types?: SearchEntityType[];

  @IsOptional()
  @IsEnum(ProductCategoryFilter, { each: true })
  @Type(() => String)
  categories?: ProductCategoryFilter[];

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  providerType?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxDistance?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  verifiedOnly?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  inStockOnly?: boolean;

  @IsOptional()
  @IsEnum(SearchSortBy)
  sortBy?: SearchSortBy;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
