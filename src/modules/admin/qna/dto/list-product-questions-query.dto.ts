import { ProductQuestionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListProductQuestionsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ProductQuestionStatus) status?: ProductQuestionStatus;
  @IsOptional() @Type(() => Number) @IsInt() productId?: number;
  // Matches the question, the asker's name/email, the product title, or an answer.
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
