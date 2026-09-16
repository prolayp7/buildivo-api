import { AddressType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class CreateAddressDto {
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsString() @MinLength(1) @MaxLength(160) fullName: string;
  @IsOptional() @IsString() @MaxLength(160) companyName?: string;
  @IsString() @MinLength(1) @MaxLength(200) line1: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsString() @MinLength(1) @MaxLength(120) city: string;
  @IsOptional() @IsString() @MaxLength(120) county?: string;
  @IsString() @MinLength(1) @MaxLength(20) postcode: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEnum(AddressType) addressType?: AddressType;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
