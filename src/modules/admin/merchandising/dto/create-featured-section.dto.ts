import { CatalogStatus, FeaturedSectionType } from '@prisma/client';
import { ArrayUnique, IsArray, IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateFeaturedSectionDto {
  @IsString() @MinLength(1) @MaxLength(255) title: string;
  @IsString() @MinLength(1) @MaxLength(255) slug: string;
  @IsEnum(FeaturedSectionType) sectionType: FeaturedSectionType;
  @IsOptional() @IsInt() categoryId?: number;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
  @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) manualProductIds?: number[];
}
