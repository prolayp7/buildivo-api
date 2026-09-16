import { ArrayUnique, IsArray, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCollectionDto {
  @IsString() @MinLength(1) @MaxLength(255) title: string;
  @IsString() @MinLength(1) @MaxLength(255) slug: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(100) type?: string;
  @IsArray() @ArrayUnique() @IsInt({ each: true }) productIds: number[];
}
