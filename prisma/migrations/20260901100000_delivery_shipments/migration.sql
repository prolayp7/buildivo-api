CREATE TYPE "DeliveryCarrier" AS ENUM ('FEDEX', 'EVRI');
CREATE TYPE "ShipmentStatus" AS ENUM ('CREATED', 'BOOKING', 'LABEL_READY', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', 'CANCELLED', 'UNKNOWN');

CREATE TABLE "shipments" (
  "id" SERIAL NOT NULL,
  "uuid" TEXT NOT NULL,
  "order_id" INTEGER NOT NULL,
  "carrier" "DeliveryCarrier" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "carrier_shipment_id" TEXT,
  "tracking_number" TEXT,
  "tracking_url" TEXT,
  "service_code" TEXT NOT NULL,
  "status" "ShipmentStatus" NOT NULL DEFAULT 'CREATED',
  "weight_kg" DECIMAL(8,3) NOT NULL,
  "length_cm" DECIMAL(8,2),
  "width_cm" DECIMAL(8,2),
  "height_cm" DECIMAL(8,2),
  "declared_value" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "shipping_cost" DECIMAL(10,2),
  "label_format" TEXT NOT NULL DEFAULT 'PDF',
  "label_url" TEXT,
  "estimated_delivery_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "failure_code" TEXT,
  "failure_message" TEXT,
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "raw_payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shipments_weight_positive" CHECK ("weight_kg" > 0),
  CONSTRAINT "shipments_declared_value_nonnegative" CHECK ("declared_value" >= 0),
  CONSTRAINT "shipments_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "shipment_events" (
  "id" SERIAL NOT NULL,
  "shipment_id" INTEGER NOT NULL,
  "provider_event_id" TEXT,
  "status" "ShipmentStatus" NOT NULL,
  "event_code" TEXT,
  "description" TEXT,
  "location" TEXT,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shipments_uuid_key" ON "shipments"("uuid");
CREATE UNIQUE INDEX "shipments_carrier_idempotency_key_key" ON "shipments"("carrier", "idempotency_key");
CREATE UNIQUE INDEX "shipments_carrier_carrier_shipment_id_key" ON "shipments"("carrier", "carrier_shipment_id");
CREATE UNIQUE INDEX "shipments_carrier_tracking_number_key" ON "shipments"("carrier", "tracking_number");
CREATE INDEX "shipments_order_id_created_at_idx" ON "shipments"("order_id", "created_at");
CREATE INDEX "shipments_status_updated_at_idx" ON "shipments"("status", "updated_at");
CREATE UNIQUE INDEX "shipment_events_shipment_id_provider_event_id_key" ON "shipment_events"("shipment_id", "provider_event_id");
CREATE INDEX "shipment_events_shipment_id_occurred_at_idx" ON "shipment_events"("shipment_id", "occurred_at");

ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
