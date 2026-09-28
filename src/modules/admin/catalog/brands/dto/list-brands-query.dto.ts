import { CatalogStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../../common/dto/pagination-query.dto';

// Shared by the brands and suppliers lists.
export class ListBrandsQueryDto extends PaginationQueryDto {
  // Matches the name or slug (and city, for suppliers).
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsEnum(CatalogStatus) status?: CatalogStatus;
}
