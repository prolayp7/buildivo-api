import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class MaterialsCalculatorQueryDto {
  @IsString() productSlug: string;
  @Type(() => Number) @IsNumber() @Min(0.01) area: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) wastagePercent?: number;
}
