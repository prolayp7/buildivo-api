import { ReturnStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListReturnsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ReturnStatus) status?: ReturnStatus;
  // Matches the order number, product, reason, or the customer's name/email.
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
