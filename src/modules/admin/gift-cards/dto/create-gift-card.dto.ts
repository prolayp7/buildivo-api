import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
export class CreateGiftCardDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) initialBalance: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsEmail() issuedToEmail?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}
