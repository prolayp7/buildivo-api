import { AdminUserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListAdminUsersQueryDto extends PaginationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() roleId?: number;
  @IsOptional() @IsEnum(AdminUserStatus) status?: AdminUserStatus;
}
