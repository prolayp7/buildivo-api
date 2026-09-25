import { ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsDateString,
  MaxLength,
  Min,
  MinLength,
  Matches,
  ValidateNested,
} from 'class-validator';

class ProductCompatibilityDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  socket?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  compatibleSockets?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  memoryType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  wattageCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  wattageRequired?: number;
}

class InitialProductVariantDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice?: number;

  @IsInt()
  @Min(0)
  stockQty: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  widthCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  heightCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lengthCm?: number;
}

export class CreateProductDto {
  @IsInt()
  categoryId: number;

  @IsOptional()
  @IsInt()
  brandId?: number;

  @IsOptional()
  @IsInt()
  supplierId?: number;

  @IsOptional()
  @IsInt()
  productConditionId?: number;

  @IsOptional()
  @IsInt()
  taxRateId?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mpn?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{8}|\d{12,14})$/, { message: 'gtin must contain 8, 12, 13 or 14 digits' })
  gtin?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{12}$/, { message: 'upc must contain exactly 12 digits' })
  upc?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  specsSummary?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  warrantyMonths?: number;

  @IsOptional()
  @IsBoolean()
  allowCustomization?: boolean;

  @IsOptional()
  @IsString()
  customizationInstructions?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minimumOrderQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  stockLocation?: string;

  @IsOptional()
  @IsBoolean()
  receiveLowStockAlert?: boolean;

  // DIY materials calculator: e.g. 12 with coverageUnit "m2_per_litre" for
  // paint, or "m2_per_box" for tiles/flooring. Omit for non-calculator products.
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  coverageValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  coverageUnit?: string;

  // Battery/tool ecosystem this product belongs to, e.g. "DeWalt 18V XR".
  // Shared by bare tools, batteries and chargers so the compatibility finder
  // can match them. Omit for products that aren't part of a tool platform.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  toolPlatform?: string;

  @IsOptional()
  @IsIn(['DENY', 'ALLOW'])
  outOfStockBehavior?: 'DENY' | 'ALLOW';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  inStockLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  outOfStockLabel?: string;

  @IsOptional()
  @IsDateString()
  availabilityDate?: string;

  @IsOptional()
  @IsIn(['NONE', 'DEFAULT', 'SPECIFIC'])
  deliveryTimeMode?: 'NONE' | 'DEFAULT' | 'SPECIFIC';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  inStockDeliveryTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  outOfStockDeliveryTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  additionalShippingCost?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  shippingMethodIds?: number[];

  @IsOptional()
  @ValidateNested()
  @Type(() => InitialProductVariantDto)
  initialVariant?: InitialProductVariantDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductCompatibilityDto)
  compatibility?: ProductCompatibilityDto;

  @IsOptional()
  @IsBoolean()
  isReturnable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  returnableDays?: number;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isTopProduct?: boolean;

  @IsOptional()
  @IsBoolean()
  isIndexable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  seoTags?: string[];

  @IsOptional()
  @IsIn(['NOT_FOUND', 'GONE', 'REDIRECT_CATEGORY_301', 'REDIRECT_CATEGORY_302'])
  offlineRedirectBehavior?: 'NOT_FOUND' | 'GONE' | 'REDIRECT_CATEGORY_301' | 'REDIRECT_CATEGORY_302';

  @IsOptional()
  @IsInt()
  redirectTargetCategoryId?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  secondaryCategoryIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  relatedProductIds?: number[];
}
