import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProductFaqDto {
  @IsString()
  @MinLength(1)
  question: string;

  @IsString()
  @MinLength(1)
  answer: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
