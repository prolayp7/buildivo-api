import { Type } from 'class-transformer';
import { IsInt, IsNumber, Min } from 'class-validator';

export class UpsertPriceTierDto {
  @Type(() => Number) @IsInt() @Min(2) minQty: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) unitPrice: number;
}
