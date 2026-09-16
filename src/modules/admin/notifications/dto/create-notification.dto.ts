import { IsInt, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateNotificationDto { @IsOptional() @IsInt() userId?: number; @IsString() @MinLength(1) @MaxLength(100) type: string; @IsString() @MinLength(1) @MaxLength(255) title: string; @IsString() @MinLength(1) message: string; @IsOptional() @IsObject() metadata?: Record<string, unknown>; }
