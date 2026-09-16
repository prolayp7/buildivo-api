import { IsEmail, IsInt, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAdminUserDto {
  @IsEmail() @MaxLength(255) email: string;
  @IsString() @MinLength(1) @MaxLength(255) name: string;
  @IsInt() roleId: number;
  @IsString() @MinLength(10) @MaxLength(128) temporaryPassword: string;
}
