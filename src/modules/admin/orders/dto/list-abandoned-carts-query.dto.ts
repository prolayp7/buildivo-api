import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListAbandonedCartsQueryDto extends PaginationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(720) inactivityHours = 24;
  @IsOptional() @IsIn(['ALL', 'REGISTERED', 'GUEST']) customerType: 'ALL' | 'REGISTERED' | 'GUEST' = 'ALL';
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsIn(['lastActive', 'customer', 'items', 'value']) sortBy: 'lastActive' | 'customer' | 'items' | 'value' = 'lastActive';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'desc';
}
