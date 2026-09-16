import { BannerLinkType, CatalogStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateBannerDto {
  @IsString() @MinLength(1) @MaxLength(255) title: string;
  @IsString() @MinLength(1) @MaxLength(255) slug: string;
  @IsEnum(BannerLinkType) linkType: BannerLinkType;
  @IsOptional() @IsInt() productId?: number;
  @IsOptional() @IsInt() categoryId?: number;
  @IsOptional() @IsInt() brandId?: number;
  @IsOptional() @IsString() @MaxLength(2048) customUrl?: string;
  @IsString() @MinLength(1) @MaxLength(100) position: string;
  @IsOptional() @IsInt() displayOrder?: number;
  @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}
