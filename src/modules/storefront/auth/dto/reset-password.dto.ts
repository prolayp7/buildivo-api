import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit code' })
  code: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword: string;
}
