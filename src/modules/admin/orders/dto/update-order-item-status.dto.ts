import { OrderItemStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateOrderItemStatusDto { @IsEnum(OrderItemStatus) status: OrderItemStatus; }
