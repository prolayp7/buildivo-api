import { IsEmail } from 'class-validator';

export class CapturePaymentAttemptDto {
  @IsEmail()
  email!: string;
}
