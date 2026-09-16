import { PickupStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
export class ApproveReturnDto { @IsOptional() @IsEnum(PickupStatus) pickupStatus?: PickupStatus; }
