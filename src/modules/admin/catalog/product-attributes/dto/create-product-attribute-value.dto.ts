import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProductAttributeValueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  value: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  swatchValue?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
