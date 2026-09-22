import { BannerLinkType, CatalogStatus } from '@prisma/client'; import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateHeroSlideDto {
  @IsOptional() @IsString() @MaxLength(255) eyebrow?: string;
  @IsString() @MinLength(1) heading: string;
  @IsOptional() @IsString() @MaxLength(255) highlight?: string;
  @IsOptional() @IsString() @MaxLength(255) ending?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(255) overlayBadge?: string;
  @IsOptional() @IsString() @MaxLength(255) specification?: string;
  @IsOptional() @IsString() @MaxLength(2048) image?: string;
  @IsOptional() @IsString() @MaxLength(255) imageAlt?: string;
  @IsOptional() @IsString() @MaxLength(20) imageFit?: string;
  @IsOptional() @IsString() @MaxLength(255) imagePosition?: string;
  @IsOptional() @IsString() @MaxLength(255) ctaLabel?: string;
  @IsEnum(BannerLinkType) linkType: BannerLinkType;
  @IsOptional() @IsInt() productId?: number;
  @IsOptional() @IsInt() categoryId?: number;
  @IsOptional() @IsString() @MaxLength(2048) customUrl?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}
