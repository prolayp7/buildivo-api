import { AttributeInputType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProductAttributeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  slug: string;

  @IsEnum(AttributeInputType)
  inputType: AttributeInputType;

  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean;
}
