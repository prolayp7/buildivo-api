import { IsString, MinLength } from 'class-validator';

export class CreateProductQuestionDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(3) question: string;
}
