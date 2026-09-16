import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class ListShipmentsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt()
  orderId?: number;
}
