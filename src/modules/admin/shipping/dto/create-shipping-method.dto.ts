import { CatalogStatus, ShippingRateType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateShippingMethodDto {
  @IsString() @MinLength(1) @MaxLength(255)
  title: string;

  @IsString() @MinLength(1) @MaxLength(255)
  carrier: string;

  @IsOptional() @IsEnum(ShippingRateType)
  rateType?: ShippingRateType;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  flatRate?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  freeOverAmount?: number;

  @IsOptional() @IsInt() @Min(0)
  estimatedDaysMin?: number;

  @IsOptional() @IsInt() @Min(0)
  estimatedDaysMax?: number;

  @IsOptional() @IsEnum(CatalogStatus)
  status?: CatalogStatus;
}
