import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { CapturePaymentAttemptDto } from './dto/capture-payment-attempt.dto';
import { CreatePaymentAttemptDto } from './dto/create-payment-attempt.dto';
import { PaymentStatusQueryDto } from './dto/payment-status-query.dto';
import { PaymentAttemptsService } from './payment-attempts.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly attempts: PaymentAttemptsService) {}

  @Get('methods')
  methods() {
    return this.attempts.methods();
  }

  @Post('attempts')
  create(@Body() dto: CreatePaymentAttemptDto, @Headers('idempotency-key') idempotencyKey?: string) {
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must contain 16 to 128 safe characters');
    }
    return this.attempts.create(dto, idempotencyKey);
  }

  @Get('attempts/:uuid')
  status(@Param('uuid') uuid: string, @Query() query: PaymentStatusQueryDto) {
    return this.attempts.status(uuid, query.email);
  }

  @Post('attempts/:uuid/capture')
  capture(@Param('uuid') uuid: string, @Body() dto: CapturePaymentAttemptDto) {
    return this.attempts.capture(uuid, dto.email);
  }
}
