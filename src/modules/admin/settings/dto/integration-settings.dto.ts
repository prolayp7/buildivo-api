import { IsBoolean, IsIn, IsObject, IsString, MinLength } from 'class-validator';

export class UnlockIntegrationDto {
  @IsString() @IsIn(['payment.paypal', 'payment.2checkout', 'payment.stripe', 'payment.skrill', 'delivery.fedex', 'delivery.evri', 'email.smtp']) scope!: string;
  @IsString() @MinLength(1) password!: string;
}

export class SaveIntegrationDto {
  @IsIn(['SANDBOX', 'LIVE']) mode!: 'SANDBOX' | 'LIVE';
  @IsBoolean() enabled!: boolean;
  @IsObject() settings!: Record<string, unknown>;
}
