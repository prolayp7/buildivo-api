import { IsInt, IsOptional, ValidateIf } from 'class-validator';

export class UpdateStockDto {
  @ValidateIf((dto: UpdateStockDto) => dto.delta === undefined)
  @IsInt()
  stockQty?: number;

  @IsOptional()
  @IsInt()
  delta?: number;
}
