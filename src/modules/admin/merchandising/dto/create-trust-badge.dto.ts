import { CatalogStatus } from '@prisma/client'; import { IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateTrustBadgeDto { @IsString() @MinLength(1) @MaxLength(255) label: string; @IsOptional() @IsString() @MaxLength(255) icon?: string; @IsOptional() @IsInt() sortOrder?: number; @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus; }
