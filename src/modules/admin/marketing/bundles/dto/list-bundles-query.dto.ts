import { Transform } from 'class-transformer';
import { BundleStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto/pagination-query.dto';
export class ListBundlesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(BundleStatus) status?: BundleStatus;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() includeDeleted?: boolean;
}
