import { Type } from 'class-transformer';
import { IsDefined, IsEmail, IsInt, IsOptional, IsPositive, IsString, Length, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class CheckoutAddressDto {
  @IsString() @MinLength(1) @MaxLength(160) fullName: string;
  @IsOptional() @IsString() @MaxLength(160) companyName?: string;
  @IsString() @MinLength(1) @MaxLength(200) line1: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsString() @MinLength(1) @MaxLength(120) city: string;
  @IsOptional() @IsString() @MaxLength(120) county?: string;
  @IsString() @MinLength(1) @MaxLength(20) postcode: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class CheckoutDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  shippingAddress: CheckoutAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  billingAddress?: CheckoutAddressDto;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  shippingMethodId: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  couponCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNote?: string;
}
