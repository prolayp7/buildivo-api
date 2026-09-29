import { RefundStatus, ReturnRequestStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListReturnsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ReturnRequestStatus) status?: ReturnRequestStatus;
  // Matches the return number, order number, product, or the customer's name/email.
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class ListRefundsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(RefundStatus) status?: RefundStatus;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
}
