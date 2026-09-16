import { QuoteStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class QuoteItemPriceDto {
  @IsInt() id: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) quotedUnitPrice: number;
}

export class RespondQuoteRequestDto {
  @IsOptional() @IsEnum(QuoteStatus) status?: QuoteStatus;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) quotedTotal?: number;
  @IsOptional() @IsString() adminNote?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuoteItemPriceDto) items?: QuoteItemPriceDto[];
}
