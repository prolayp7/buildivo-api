import { IsArray, IsBoolean, IsIn, IsInt, IsJSON, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CatalogStatus, PageSchemaType, TwitterCardType } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { CreateCategoryFaqDto } from './create-category-faq.dto';

export class CreateCategoryDto {
  @IsOptional()
  @IsInt()
  parentId?: number;

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

  @IsOptional()
  @IsString()
  additionalDescription?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isIndexable?: boolean;

  @IsOptional()
  @IsBoolean()
  showOnHomepage?: boolean;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  coverImageAlt?: string;

  @IsOptional()
  @IsString()
  thumbnailImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  thumbnailImageAlt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pageHeader?: string;

  @IsOptional()
  @IsString()
  @MaxLength(70)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaKeywords?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  metaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(70)
  ogTitle?: string;

  @IsOptional()
  @IsString()
  ogImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ogImageAlt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  ogDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(70)
  twitterTitle?: string;

  @IsOptional()
  @IsEnum(TwitterCardType)
  twitterCard?: TwitterCardType;

  @IsOptional()
  @IsString()
  twitterImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  twitterDescription?: string;

  @IsOptional()
  @IsEnum(PageSchemaType)
  schemaType?: PageSchemaType;

  @IsOptional()
  @IsString()
  @IsJSON()
  customSchema?: string;

  @IsOptional()
  @IsString()
  @IsJSON()
  faqSchema?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryFaqDto)
  faqs?: CreateCategoryFaqDto[];

  @IsOptional()
  @IsIn(['NOT_FOUND', 'GONE', 'REDIRECT_CATEGORY_301', 'REDIRECT_CATEGORY_302'])
  offlineRedirectBehavior?: 'NOT_FOUND' | 'GONE' | 'REDIRECT_CATEGORY_301' | 'REDIRECT_CATEGORY_302';

  @IsOptional()
  @IsInt()
  redirectTargetCategoryId?: number;

  @IsOptional()
  @IsEnum(CatalogStatus)
  status?: CatalogStatus;
}
