import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { deliveryCarriers, DeliveryCarrier } from '../carrier-gateways.service';

export class CreateShipmentDto {
  @Type(() => Number) @IsInt() @Min(1)
  orderId!: number;

  @IsIn(deliveryCarriers)
  carrier!: DeliveryCarrier;

  @IsString() @MinLength(1) @MaxLength(80)
  serviceCode!: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001)
  weightKg!: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  lengthCm?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  widthCm?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  heightCm?: number;

  @IsOptional() @IsIn(['PDF', 'PNG', 'ZPL'])
  labelFormat?: 'PDF' | 'PNG' | 'ZPL';
}
