import { Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaymentWebhooksService } from './payment-webhooks.service';

@Controller('payments/webhooks')
export class PaymentWebhooksController {
  constructor(private readonly webhooksService: PaymentWebhooksService) {}

  // No auth guard: the provider calls this directly, unauthenticated. The
  // signature check inside handleStripe() is the authentication mechanism.
  @Post('stripe')
  @HttpCode(200)
  stripe(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.webhooksService.handleStripe(req.rawBody ?? Buffer.alloc(0), signature);
  }

  // Same no-guard reasoning as stripe() above - handlePaypal()'s remote
  // signature verification (via PayPal's own API) is the authentication.
  @Post('paypal')
  @HttpCode(200)
  paypal(@Req() req: RawBodyRequest<Request>) {
    return this.webhooksService.handlePaypal(req.rawBody ?? Buffer.alloc(0), req.headers as Record<string, string | undefined>);
  }
}
