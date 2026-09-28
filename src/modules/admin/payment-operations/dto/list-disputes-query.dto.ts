import { DisputeStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListDisputesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(DisputeStatus) status?: DisputeStatus;
  // Matches the order number, the provider's dispute reference, the reason, or the customer's name/email.
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
