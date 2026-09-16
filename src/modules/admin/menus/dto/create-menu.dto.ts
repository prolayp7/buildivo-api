import { CatalogStatus, MenuLocation } from '@prisma/client'; import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateMenuDto { @IsString() @MinLength(1) @MaxLength(255) name: string; @IsString() @MinLength(1) @MaxLength(255) slug: string; @IsEnum(MenuLocation) location: MenuLocation; @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus; }
