import { ProductStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto/pagination-query.dto';

export class ListProductsQueryDto extends PaginationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idMin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idMax?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceMax?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stockMin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stockMax?: number;
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  brandId?: number;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  includeDeleted?: boolean;
}
