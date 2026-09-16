import { Type } from 'class-transformer';
import { IsInt, IsPositive, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productVariantId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number = 1;
}
