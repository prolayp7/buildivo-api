CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'PAYPAL', 'TWOCHECKOUT');
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'REQUIRES_CUSTOMER_ACTION', 'PROCESSING', 'AUTHORIZED', 'CAPTURED', 'DECLINED', 'FAILED', 'CANCELLED', 'EXPIRED', 'UNKNOWN');

CREATE TABLE "payment_attempts" (
  "id" SERIAL NOT NULL,
  "uuid" TEXT NOT NULL,
  "order_id" INTEGER NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "provider_object_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "capture_mode" TEXT NOT NULL DEFAULT 'AUTOMATIC',
  "redirect_url" TEXT,
  "failure_category" TEXT,
  "failure_code" TEXT,
  "failure_message" TEXT,
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_attempts_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "payment_attempts_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "payment_state_history" (
  "id" SERIAL NOT NULL,
  "payment_attempt_id" INTEGER NOT NULL,
  "from_status" "PaymentAttemptStatus",
  "to_status" "PaymentAttemptStatus" NOT NULL,
  "source" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_state_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payment_transactions" ADD COLUMN "payment_attempt_id" INTEGER;

CREATE UNIQUE INDEX "payment_attempts_uuid_key" ON "payment_attempts"("uuid");
CREATE UNIQUE INDEX "payment_attempts_provider_idempotency_key_key" ON "payment_attempts"("provider", "idempotency_key");
CREATE UNIQUE INDEX "payment_attempts_provider_provider_object_id_key" ON "payment_attempts"("provider", "provider_object_id");
CREATE INDEX "payment_attempts_order_id_created_at_idx" ON "payment_attempts"("order_id", "created_at");
CREATE INDEX "payment_attempts_status_created_at_idx" ON "payment_attempts"("status", "created_at");
CREATE INDEX "payment_state_history_payment_attempt_id_created_at_idx" ON "payment_state_history"("payment_attempt_id", "created_at");
CREATE INDEX "payment_transactions_payment_attempt_id_idx" ON "payment_transactions"("payment_attempt_id");

ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_state_history" ADD CONSTRAINT "payment_state_history_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
