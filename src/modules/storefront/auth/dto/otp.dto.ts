import { IsEmail, IsIn, Matches } from 'class-validator';

export const OTP_PURPOSES = ['email_verification', 'password_reset'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export class SendOtpDto {
  @IsEmail()
  email: string;

  @IsIn(OTP_PURPOSES)
  purpose: OtpPurpose;
}

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @IsIn(OTP_PURPOSES)
  purpose: OtpPurpose;

  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit code' })
  code: string;
}
