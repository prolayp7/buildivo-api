import { GiftCardStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
export class ListGiftCardsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(GiftCardStatus) status?: GiftCardStatus;
  @IsOptional() @IsString() q?: string;
}
