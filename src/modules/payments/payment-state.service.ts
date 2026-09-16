import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const paymentAttemptStatuses = ['CREATED', 'REQUIRES_CUSTOMER_ACTION', 'PROCESSING', 'AUTHORIZED', 'CAPTURED', 'DECLINED', 'FAILED', 'CANCELLED', 'EXPIRED', 'UNKNOWN'] as const;
export type PaymentAttemptStatus = typeof paymentAttemptStatuses[number];

const transitions: Record<PaymentAttemptStatus, readonly PaymentAttemptStatus[]> = {
  CREATED: ['REQUIRES_CUSTOMER_ACTION', 'PROCESSING', 'AUTHORIZED', 'CAPTURED', 'DECLINED', 'FAILED', 'CANCELLED', 'EXPIRED', 'UNKNOWN'],
  REQUIRES_CUSTOMER_ACTION: ['PROCESSING', 'AUTHORIZED', 'CAPTURED', 'DECLINED', 'FAILED', 'CANCELLED', 'EXPIRED', 'UNKNOWN'],
  PROCESSING: ['AUTHORIZED', 'CAPTURED', 'DECLINED', 'FAILED', 'CANCELLED', 'UNKNOWN'],
  AUTHORIZED: ['CAPTURED', 'FAILED', 'CANCELLED', 'UNKNOWN'],
  UNKNOWN: ['REQUIRES_CUSTOMER_ACTION', 'PROCESSING', 'AUTHORIZED', 'CAPTURED', 'DECLINED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  DECLINED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  CAPTURED: [],
};

@Injectable()
export class PaymentStateService {
  constructor(private readonly prisma: PrismaService) {}

  async transition(
    attemptId: number,
    toStatus: PaymentAttemptStatus,
    source: string,
    reason?: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const [attempt] = await tx.$queryRaw<{ id: number; status: PaymentAttemptStatus }[]>`
        SELECT id, status::text FROM payment_attempts WHERE id = ${attemptId} FOR UPDATE
      `;
      if (!attempt) throw new BadRequestException('Payment attempt not found');
      if (attempt.status === toStatus) return attempt;
      if (!transitions[attempt.status].includes(toStatus)) {
        throw new BadRequestException(`Payment cannot change from ${attempt.status} to ${toStatus}`);
      }
      await tx.$executeRaw`
        UPDATE payment_attempts SET status = CAST(${toStatus} AS "PaymentAttemptStatus"), updated_at = NOW()
        WHERE id = ${attempt.id} AND status = CAST(${attempt.status} AS "PaymentAttemptStatus")
      `;
      await tx.$executeRaw`
        INSERT INTO payment_state_history (payment_attempt_id, from_status, to_status, source, reason, metadata)
        VALUES (${attempt.id}, CAST(${attempt.status} AS "PaymentAttemptStatus"), CAST(${toStatus} AS "PaymentAttemptStatus"),
                ${source}, ${reason ?? null}, CAST(${metadata === undefined ? null : JSON.stringify(metadata)} AS JSONB))
      `;
      return { id: attempt.id, status: toStatus };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
