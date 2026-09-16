import { ReturnStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
export class ListReturnsQueryDto extends PaginationQueryDto { @IsOptional() @IsEnum(ReturnStatus) status?: ReturnStatus; }
