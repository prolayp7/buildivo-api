import { IsString, MaxLength, MinLength } from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code: string;
}
