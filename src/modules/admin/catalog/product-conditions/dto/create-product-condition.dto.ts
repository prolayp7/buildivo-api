import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProductConditionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  slug: string;
}
