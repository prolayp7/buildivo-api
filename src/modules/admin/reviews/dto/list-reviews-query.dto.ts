import { ReviewStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
export class ListReviewsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ReviewStatus) status?: ReviewStatus;
  @IsOptional() @Type(() => Number) @IsInt() productId?: number;
  // Matches the title, comment, product title, or the reviewer's name/email.
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) rating?: number;
  // "true" = tied to a purchased order line, "false" = not.
  @IsOptional() @IsIn(['true', 'false']) verified?: 'true' | 'false';
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
