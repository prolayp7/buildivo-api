CREATE SEQUENCE "invoice_number_seq";

CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "order_id" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "meta" JSONB,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- backfill: orders already paid get an invoice, numbered in placement order
INSERT INTO "invoices" ("invoice_number", "order_id", "currency", "total", "issued_at")
SELECT 'INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0'), o.id,
       COALESCE((SELECT t.currency FROM payment_transactions t WHERE t.order_id = o.id ORDER BY t.id LIMIT 1), 'GBP'),
       o.total, COALESCE((SELECT min(t.created_at) FROM payment_transactions t WHERE t.order_id = o.id), o.placed_at)
FROM "orders" o WHERE o.payment_status IN ('PAID','REFUNDED','PARTIALLY_REFUNDED') ORDER BY o.placed_at, o.id;
