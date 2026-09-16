import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, Min } from 'class-validator'; import { Type } from 'class-transformer';
export class DateRangeQueryDto { @IsDateString() dateFrom: string; @IsDateString() dateTo: string; }
export class SalesReportQueryDto extends DateRangeQueryDto { @IsIn(['day', 'week', 'month']) groupBy: 'day' | 'week' | 'month'; }
export class ProductsReportQueryDto { @IsOptional() @IsDateString() dateFrom?: string; @IsOptional() @IsDateString() dateTo?: string; @IsOptional() @IsIn(['best', 'worst', 'stock']) sort?: 'best' | 'worst' | 'stock'; }
export class InventoryReportQueryDto { @IsOptional() @Type(() => Number) @IsInt() @Min(0) threshold?: number; }
