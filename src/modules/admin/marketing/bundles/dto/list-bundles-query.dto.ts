import { Transform } from 'class-transformer';
import { BundleStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto/pagination-query.dto';
export class ListBundlesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(BundleStatus) status?: BundleStatus;
  // Where "now" falls in the bundle's startsAt/endsAt window.
  @IsOptional() @IsIn(['LIVE', 'SCHEDULED', 'EXPIRED']) schedule?: 'LIVE' | 'SCHEDULED' | 'EXPIRED';
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() includeDeleted?: boolean;
}
