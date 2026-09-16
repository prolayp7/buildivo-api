import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';
export class RefundReturnDto { @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) refundAmount: number; }
