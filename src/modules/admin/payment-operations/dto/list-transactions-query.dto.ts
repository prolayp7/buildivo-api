import { PaymentTxnStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export const TRANSACTION_PROVIDERS = ['STRIPE', 'PAYPAL', 'TWOCHECKOUT'] as const;

export class ListTransactionsQueryDto extends PaginationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() orderId?: number;
  @IsOptional() @IsEnum(PaymentTxnStatus) status?: PaymentTxnStatus;
  @IsOptional() @IsIn(TRANSACTION_PROVIDERS) provider?: (typeof TRANSACTION_PROVIDERS)[number];
  // Matches the order number, the provider's reference, or the customer's name/email.
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
