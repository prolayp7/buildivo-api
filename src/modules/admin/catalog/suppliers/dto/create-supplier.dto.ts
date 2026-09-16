import { CatalogStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateSupplierDto {
  @IsString() @MinLength(1) @MaxLength(255) title: string;
  @IsString() @MinLength(1) @MaxLength(255) slug: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() mobilePhone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() county?: string;
  @IsOptional() @IsString() postcode?: string;
  @IsOptional() @IsString() countryCode?: string;
  @IsOptional() @IsString() companyNumber?: string;
  @IsOptional() @IsString() vatNumber?: string;
  @IsOptional() @IsString() @MaxLength(255) metaTitle?: string;
  @IsOptional() @IsString() metaDescription?: string;
  @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
}
