import { OrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus) toStatus: OrderStatus;
  @IsOptional() @IsString() note?: string;
}
