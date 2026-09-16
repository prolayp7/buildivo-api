import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsJSON, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto/pagination-query.dto';

const SORT_OPTIONS = ['newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc', 'discount_desc'] as const;
export type ProductSort = (typeof SORT_OPTIONS)[number];

export class ListStorefrontProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  brand?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  priceMax?: number;

  @IsOptional()
  @IsIn(SORT_OPTIONS)
  sort?: ProductSort = 'newest';

  @IsOptional()
  @IsString()
  @IsJSON()
  @MaxLength(4000)
  specs?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  inStock?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onSale?: boolean;

  // Fetch a specific, ordered set of products (recently-viewed rails, quick
  // view, etc.) instead of filtering/sorting the catalogue - mutually
  // exclusive with every other filter above.
  @IsOptional()
  @Transform(({ value }) => String(value).split(',').map((v) => Number(v.trim())).filter((n) => Number.isInteger(n)))
  @IsArray()
  @IsInt({ each: true })
  ids?: number[];
}
