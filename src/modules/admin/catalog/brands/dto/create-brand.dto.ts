import { CatalogStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBrandDto {
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
  description?: string;

  @IsOptional() @IsString() shortDescription?: string;
  @IsOptional() @IsString() @MaxLength(255) metaTitle?: string;
  @IsOptional() @IsString() metaDescription?: string;

  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;
}
