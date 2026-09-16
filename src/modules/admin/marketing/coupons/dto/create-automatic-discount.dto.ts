import { CatalogStatus, DiscountType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
export class CreateAutomaticDiscountDto {
  @IsString() @MinLength(1) @MaxLength(255) name: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(DiscountType) discountType: DiscountType;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) discountAmount: number;
  @IsString() targetType: string;
  @IsArray() @ArrayUnique() @IsInt({ each: true }) targetIds: number[];
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() showSaleBadge?: boolean;
  @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
}
