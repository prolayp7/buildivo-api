import { IsEmail, IsIn, IsUUID } from 'class-validator';

export const paymentProviders = ['STRIPE', 'PAYPAL', 'TWOCHECKOUT'] as const;
export type PaymentProvider = typeof paymentProviders[number];

export class CreatePaymentAttemptDto {
  @IsUUID()
  orderUuid!: string;

  @IsEmail()
  email!: string;

  @IsIn(paymentProviders)
  provider!: PaymentProvider;
}
