import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  orderItemId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
