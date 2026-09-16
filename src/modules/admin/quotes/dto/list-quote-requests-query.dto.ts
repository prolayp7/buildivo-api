import { QuoteStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListQuoteRequestsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(QuoteStatus) status?: QuoteStatus;
}
