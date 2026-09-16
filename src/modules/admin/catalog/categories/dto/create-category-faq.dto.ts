import { IsString, MinLength } from 'class-validator';

export class CreateCategoryFaqDto {
  @IsString()
  @MinLength(1)
  question: string;

  @IsString()
  @MinLength(1)
  answer: string;
}
