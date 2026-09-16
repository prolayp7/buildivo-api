import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';

type ShipmentRow = {
  id: number; uuid: string; order_id: number; carrier: string; idempotency_key: string; carrier_shipment_id: string | null;
  tracking_number: string | null; tracking_url: string | null; service_code: string; status: string; weight_kg: Prisma.Decimal;
  length_cm: Prisma.Decimal | null; width_cm: Prisma.Decimal | null; height_cm: Prisma.Decimal | null; declared_value: Prisma.Decimal;
  currency: string; shipping_cost: Prisma.Decimal | null; label_format: string; label_url: string | null;
  estimated_delivery_at: Date | null; delivered_at: Date | null; failure_code: string | null; failure_message: string | null;
  retryable: boolean; created_at: Date; updated_at: Date;
};

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateShipmentDto, idempotencyKey: string) {
    const [order] = await this.prisma.$queryRaw<{ id: number; total: Prisma.Decimal; payment_status: string; status: string }[]>`
      SELECT id, total, payment_status::text, status::text FROM orders WHERE id = ${dto.orderId} LIMIT 1
    `;
    if (!order) throw new NotFoundException('Order not found');
    if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.payment_status)) throw new ConflictException('Only paid orders can be shipped');
    if (['CANCELLED', 'FAILED', 'DELIVERED'].includes(order.status)) throw new ConflictException(`Order cannot be shipped while it is ${order.status}`);
    const dimensions = [dto.lengthCm, dto.widthCm, dto.heightCm];
    if (dimensions.some((value) => value !== undefined) && dimensions.some((value) => value === undefined)) {
      throw new ConflictException('Provide all three parcel dimensions or none');
    }

    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<ShipmentRow[]>`
        INSERT INTO shipments (
          uuid, order_id, carrier, idempotency_key, service_code, weight_kg, length_cm, width_cm, height_cm,
          declared_value, currency, label_format, updated_at
        ) VALUES (
          ${randomUUID()}, ${order.id}, CAST(${dto.carrier} AS "DeliveryCarrier"), ${idempotencyKey}, ${dto.serviceCode},
          ${dto.weightKg}, ${dto.lengthCm ?? null}, ${dto.widthCm ?? null}, ${dto.heightCm ?? null},
          ${order.total}, 'GBP', ${dto.labelFormat ?? 'PDF'}, NOW()
        ) ON CONFLICT (carrier, idempotency_key) DO NOTHING
        RETURNING id, uuid, order_id, carrier::text, idempotency_key, carrier_shipment_id, tracking_number, tracking_url,
          service_code, status::text, weight_kg, length_cm, width_cm, height_cm, declared_value, currency, shipping_cost,
          label_format, label_url, estimated_delivery_at, delivered_at, failure_code, failure_message, retryable, created_at, updated_at
      `;
      if (inserted[0]) {
        await tx.$executeRaw`
          INSERT INTO shipment_events (shipment_id, status, event_code, description, occurred_at)
          VALUES (${inserted[0].id}, 'CREATED', 'LOCAL_CREATED', 'Shipment request created', NOW())
        `;
        return inserted[0];
      }
      const [existing] = await tx.$queryRaw<ShipmentRow[]>`
        SELECT id, uuid, order_id, carrier::text, idempotency_key, carrier_shipment_id, tracking_number, tracking_url,
          service_code, status::text, weight_kg, length_cm, width_cm, height_cm, declared_value, currency, shipping_cost,
          label_format, label_url, estimated_delivery_at, delivered_at, failure_code, failure_message, retryable, created_at, updated_at
        FROM shipments WHERE carrier = CAST(${dto.carrier} AS "DeliveryCarrier") AND idempotency_key = ${idempotencyKey}
      `;
      if (!existing || existing.order_id !== order.id) throw new ConflictException('Idempotency key was already used for another order');
      return existing;
    });
  }

  list(orderId?: number) {
    return this.prisma.$queryRaw<ShipmentRow[]>`
      SELECT id, uuid, order_id, carrier::text, idempotency_key, carrier_shipment_id, tracking_number, tracking_url,
        service_code, status::text, weight_kg, length_cm, width_cm, height_cm, declared_value, currency, shipping_cost,
        label_format, label_url, estimated_delivery_at, delivered_at, failure_code, failure_message, retryable, created_at, updated_at
      FROM shipments WHERE (${orderId ?? null}::integer IS NULL OR order_id = ${orderId ?? null}) ORDER BY created_at DESC
    `;
  }

  async detail(uuid: string) {
    const [shipment] = await this.prisma.$queryRaw<ShipmentRow[]>`
      SELECT id, uuid, order_id, carrier::text, idempotency_key, carrier_shipment_id, tracking_number, tracking_url,
        service_code, status::text, weight_kg, length_cm, width_cm, height_cm, declared_value, currency, shipping_cost,
        label_format, label_url, estimated_delivery_at, delivered_at, failure_code, failure_message, retryable, created_at, updated_at
      FROM shipments WHERE uuid = ${uuid} LIMIT 1
    `;
    if (!shipment) throw new NotFoundException('Shipment not found');
    const events = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, provider_event_id, status::text, event_code, description, location, occurred_at, created_at
      FROM shipment_events WHERE shipment_id = ${shipment.id} ORDER BY occurred_at ASC
    `;
    return { ...shipment, events };
  }
}
