import { IsEmail } from 'class-validator';

export class PaymentStatusQueryDto {
  @IsEmail()
  email!: string;
}
