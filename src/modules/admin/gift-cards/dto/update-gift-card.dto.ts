import { GiftCardStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';
export class UpdateGiftCardDto {
  @IsOptional() @IsEnum(GiftCardStatus) status?: GiftCardStatus;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) adjustment?: number;
}
