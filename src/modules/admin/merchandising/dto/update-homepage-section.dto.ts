import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateHomepageSectionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255)
  label?: string;

  @IsOptional() @IsBoolean()
  isVisible?: boolean;

  @IsOptional() @IsObject()
  config?: Record<string, unknown>;
}
