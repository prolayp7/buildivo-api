import { PaymentTxnStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
export class ListTransactionsQueryDto extends PaginationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() orderId?: number;
  @IsOptional() @IsEnum(PaymentTxnStatus) status?: PaymentTxnStatus;
}
