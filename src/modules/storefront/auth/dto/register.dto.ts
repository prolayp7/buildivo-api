import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
