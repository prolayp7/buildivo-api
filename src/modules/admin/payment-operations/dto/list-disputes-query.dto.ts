import { DisputeStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
export class ListDisputesQueryDto extends PaginationQueryDto { @IsOptional() @IsEnum(DisputeStatus) status?: DisputeStatus; }
