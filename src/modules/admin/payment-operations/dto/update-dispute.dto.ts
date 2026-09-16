import { DisputeStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
export class UpdateDisputeDto {
  @IsOptional() @IsEnum(DisputeStatus) status?: DisputeStatus;
  @IsOptional() @IsString() reasonDescription?: string;
}
