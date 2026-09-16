import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEmail, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

class QuoteRequestItemDto {
  @IsInt() @Min(1) productVariantId: number;
  @IsInt() @Min(1) quantity: number;
}

export class CreateQuoteRequestDto {
  @IsOptional() @IsString() companyName?: string;
  @IsString() @MinLength(1) contactName: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() message?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuoteRequestItemDto) items: QuoteRequestItemDto[];
}
