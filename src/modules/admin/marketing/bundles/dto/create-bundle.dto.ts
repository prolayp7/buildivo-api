import { BundleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

export class BundleItemDto {
  @IsInt() @Min(1) productVariantId: number;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
}

export class CreateBundleDto {
  @IsString() @MinLength(1) title: string;
  @IsString() @MinLength(1) slug: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) bundlePrice: number;
  @IsOptional() @IsEnum(BundleStatus) status?: BundleStatus;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BundleItemDto) items: BundleItemDto[];
}
