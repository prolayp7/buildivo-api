import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class AddWishlistItemDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productVariantId: number;
}
