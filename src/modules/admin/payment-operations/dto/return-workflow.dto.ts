import { ReturnInspectionResult, ReturnItemCondition } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class ItemQuantityDto {
  @Type(() => Number) @IsInt() @IsPositive() returnItemId: number;
  @Type(() => Number) @IsInt() @Min(0) quantity: number;
}

/** Approve with a quantity per item (0 = not approved; at least one item must be approved). */
export class ApproveReturnDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ItemQuantityDto) items: ItemQuantityDto[];
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class RejectReturnDto {
  @IsString() @MinLength(10, { message: 'Give the customer a clear reason (at least 10 characters)' }) @MaxLength(1000) reason: string;
}

export class SchedulePickupDto {
  @IsString() @MinLength(2) @MaxLength(100) courier: string;
  @IsDateString() pickupDate: string;
  @IsOptional() @IsString() @MaxLength(60) pickupWindow?: string;
  @IsOptional() @IsString() @MaxLength(100) trackingNumber?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

/** Received quantity per item, recorded separately from requested/approved quantities. */
export class ReceiveReturnDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ItemQuantityDto) items: ItemQuantityDto[];
}

export class InspectItemDto {
  @IsEnum(ReturnItemCondition) condition: ReturnItemCondition;
  @IsBoolean() accessoriesPresent: boolean;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsEnum(ReturnInspectionResult) result: ReturnInspectionResult;
  /** Required for PARTIALLY_ACCEPTED; ACCEPTED takes the received quantity, REJECTED takes 0. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) acceptedQuantity?: number;
  @IsOptional() @IsString() @MaxLength(1000) rejectionReason?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000) deductionAmount?: number;
  @IsOptional() @IsString() @MaxLength(500) deductionReason?: string;
}
