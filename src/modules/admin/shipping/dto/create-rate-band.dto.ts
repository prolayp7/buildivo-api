import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class CreateRateBandDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  minWeightKg: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  maxWeightKg: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  rate: number;
}
