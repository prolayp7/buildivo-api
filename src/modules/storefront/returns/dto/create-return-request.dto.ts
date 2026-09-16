import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateReturnRequestDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  orderItemId: number;

  @IsString()
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
