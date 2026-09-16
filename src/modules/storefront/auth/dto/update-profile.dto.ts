import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) lastName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword!: string;
  @IsString() @MinLength(10) @MaxLength(128) newPassword!: string;
}
