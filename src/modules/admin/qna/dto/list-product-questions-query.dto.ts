import { ProductQuestionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListProductQuestionsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ProductQuestionStatus) status?: ProductQuestionStatus;
  @IsOptional() @Type(() => Number) @IsInt() productId?: number;
}
