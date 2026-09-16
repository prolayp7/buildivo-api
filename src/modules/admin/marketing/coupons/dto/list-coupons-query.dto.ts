import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto/pagination-query.dto';
export class ListCouponsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() includeDeleted?: boolean;
}
