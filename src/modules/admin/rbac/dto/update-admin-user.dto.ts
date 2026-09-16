import { AdminUserStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAdminUserDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) name?: string;
  @IsOptional() @IsInt() roleId?: number;
  @IsOptional() @IsEnum(AdminUserStatus) status?: AdminUserStatus;
}
