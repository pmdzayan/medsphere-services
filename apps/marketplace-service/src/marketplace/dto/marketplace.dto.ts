import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsInt,
  Min,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductVisibility } from '../enums';

export class CreatePharmacyStoreDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ description: 'Store name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Store description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Physical address' })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({ description: 'Latitude coordinate' })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ description: 'Longitude coordinate' })
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional({ description: 'Operating hours as JSON object' })
  @IsOptional()
  operatingHours?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Delivery radius in kilometers', default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryRadiusKm?: number;

  @ApiPropertyOptional({ description: 'Supports pickup', default: true })
  @IsOptional()
  @IsBoolean()
  supportsPickup?: boolean;

  @ApiPropertyOptional({ description: 'Supports delivery', default: true })
  @IsOptional()
  @IsBoolean()
  supportsDelivery?: boolean;
}

export class UpdatePharmacyStoreDto {
  @ApiPropertyOptional({ description: 'Store name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Store description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Physical address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Latitude coordinate' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude coordinate' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Operating hours as JSON object' })
  @IsOptional()
  operatingHours?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Delivery radius in kilometers' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryRadiusKm?: number;

  @ApiPropertyOptional({ description: 'Supports pickup' })
  @IsOptional()
  @IsBoolean()
  supportsPickup?: boolean;

  @ApiPropertyOptional({ description: 'Supports delivery' })
  @IsOptional()
  @IsBoolean()
  supportsDelivery?: boolean;

  @ApiPropertyOptional({ description: 'Is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateMarketplaceProductDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ description: 'Pharmacy store ID' })
  @IsString()
  @IsNotEmpty()
  pharmacyId!: string;

  @ApiProperty({ description: 'Product ID from the product catalog' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ description: 'Selling price' })
  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @ApiProperty({ description: 'Available quantity', default: 0 })
  @IsInt()
  @Min(0)
  availableQuantity!: number;

  @ApiPropertyOptional({ description: 'Estimated preparation time in minutes', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedPreparationTime?: number;

  @ApiPropertyOptional({
    description: 'Product visibility',
    enum: ProductVisibility,
    default: ProductVisibility.PUBLIC,
  })
  @IsOptional()
  @IsEnum(ProductVisibility)
  visibility?: ProductVisibility;
}

export class UpdateMarketplaceProductDto {
  @ApiPropertyOptional({ description: 'Selling price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({ description: 'Available quantity' })
  @IsOptional()
  @IsInt()
  @Min(0)
  availableQuantity?: number;

  @ApiPropertyOptional({ description: 'Estimated preparation time in minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedPreparationTime?: number;

  @ApiPropertyOptional({ description: 'Product visibility', enum: ProductVisibility })
  @IsOptional()
  @IsEnum(ProductVisibility)
  visibility?: ProductVisibility;
}

export class AddToCartDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ description: 'Patient ID' })
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({ description: 'Product ID' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ description: 'Requested quantity' })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Selected pharmacy ID' })
  @IsOptional()
  @IsString()
  selectedPharmacyId?: string;
}

export class UpdateCartItemDto {
  @ApiProperty({ description: 'Quantity to update' })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Selected pharmacy ID' })
  @IsOptional()
  @IsString()
  selectedPharmacyId?: string;
}

export class CheckoutDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ description: 'Patient ID' })
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({ description: 'Shopping cart ID' })
  @IsString()
  @IsNotEmpty()
  cartId!: string;

  @ApiPropertyOptional({ description: 'Payment method' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Delivery address override' })
  @IsOptional()
  @IsString()
  deliveryAddress?: string;
}

export class SearchProductsDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiPropertyOptional({ description: 'Search query (brand, generic, SKU, barcode, category)' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ description: 'Brand name filter' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Generic name filter' })
  @IsOptional()
  @IsString()
  genericName?: string;

  @ApiPropertyOptional({ description: 'Category filter' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'SKU filter' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: 'Barcode filter' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ description: 'Pharmacy ID filter' })
  @IsOptional()
  @IsString()
  pharmacyId?: string;

  @ApiPropertyOptional({ description: 'Minimum price filter' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price filter' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Limit results', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class NearbyPharmaciesDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ description: 'Latitude coordinate' })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ description: 'Longitude coordinate' })
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional({ description: 'Search radius in kilometers', default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  radiusKm?: number;

  @ApiPropertyOptional({ description: 'Only include pharmacies that support delivery' })
  @IsOptional()
  @IsBoolean()
  supportsDelivery?: boolean;

  @ApiPropertyOptional({ description: 'Only include pharmacies that support pickup' })
  @IsOptional()
  @IsBoolean()
  supportsPickup?: boolean;
}

export class PriceComparisonDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ description: 'Product ID' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional({ description: 'Patient latitude for distance calculation' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Patient longitude for distance calculation' })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class MedicineAlternativesDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ description: 'Product ID to find alternatives for' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional({ description: 'Patient latitude for distance calculation' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Patient longitude for distance calculation' })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class FulfillmentOptionsDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ description: 'Shopping cart ID' })
  @IsString()
  @IsNotEmpty()
  cartId!: string;

  @ApiPropertyOptional({ description: 'Patient latitude for distance calculation' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Patient longitude for distance calculation' })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class AssignDeliveryDto {
  @ApiProperty({ description: 'Order ID' })
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @ApiProperty({ description: 'Delivery partner name' })
  @IsString()
  @IsNotEmpty()
  deliveryPartner!: string;

  @ApiPropertyOptional({ description: 'Tracking number' })
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional({ description: 'Estimated arrival time' })
  @IsOptional()
  @IsString()
  estimatedArrival?: string;
}

export class UpdateDeliveryStatusDto {
  @ApiProperty({ description: 'New delivery status' })
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiPropertyOptional({ description: 'Tracking number' })
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional({ description: 'Estimated arrival time' })
  @IsOptional()
  @IsString()
  estimatedArrival?: string;
}

export class RecordPaymentDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ description: 'Order ID' })
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @ApiProperty({ description: 'Payment amount' })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ description: 'Payment method' })
  @IsString()
  @IsNotEmpty()
  method!: string;

  @ApiPropertyOptional({ description: 'Payment reference number' })
  @IsOptional()
  @IsString()
  referenceNo?: string;
}
