import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListReviewsQueryDto extends PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productId: number;
}
