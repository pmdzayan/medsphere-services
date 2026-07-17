import { ProductCategory, DosageForm } from './create-product.dto';

export class ProductResponseDto {
  id!: string;
  name!: string;
  genericName?: string | null;
  brand!: string;
  category!: ProductCategory;
  subCategory?: string | null;
  description?: string | null;
  manufacturer!: string;
  dosageForm!: DosageForm;
  strength!: string;
  barcode?: string | null;
  requiresPrescription!: boolean;
  isActive!: boolean;
  createdAt!: string;
  updatedAt!: string;
}
