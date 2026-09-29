import { ReturnReason } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsPositive, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';

export class CreateReturnItemDto {
  @Type(() => Number) @IsInt() @IsPositive() orderItemId: number;
  @Type(() => Number) @IsInt() @IsPositive() quantity: number;
  @IsEnum(ReturnReason) reason: ReturnReason;
  @ValidateIf((item: CreateReturnItemDto) => item.reason === 'OTHER') @IsString() @MaxLength(300) reasonOther?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

/** Sent as the `data` JSON field of a multipart request; photos are files named `evidence_<item index>`. */
export class CreateReturnRequestDto {
  @IsUUID() orderUuid: string;
  /** One of the customer's saved addresses; omitted = the order's delivery address. */
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() addressId?: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CreateReturnItemDto) items: CreateReturnItemDto[];
}
