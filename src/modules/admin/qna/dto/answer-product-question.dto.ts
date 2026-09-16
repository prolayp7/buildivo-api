import { IsString, MinLength } from 'class-validator';

export class AnswerProductQuestionDto {
  @IsString() @MinLength(1) answer: string;
}
