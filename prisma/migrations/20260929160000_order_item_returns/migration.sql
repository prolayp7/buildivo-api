-- CreateEnum
CREATE TYPE "ReturnRequestStatus" AS ENUM ('RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'RETURN_RECEIVED', 'INSPECTION', 'REFUND_APPROVED', 'REFUND_PROCESSING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('DAMAGED', 'DEFECTIVE', 'WRONG_ITEM', 'MISSING_PARTS', 'NOT_AS_DESCRIBED', 'POOR_CONDITION', 'CHANGED_MIND', 'OTHER');

-- CreateEnum
CREATE TYPE "ReturnItemCondition" AS ENUM ('NEW', 'OPENED', 'USED', 'DAMAGED', 'DEFECTIVE', 'MISSING_PARTS');

-- CreateEnum
CREATE TYPE "ReturnInspectionResult" AS ENUM ('ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReturnImageType" AS ENUM ('CUSTOMER_EVIDENCE', 'ADMIN_INSPECTION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'PARTIALLY_RETURNED';
ALTER TYPE "OrderStatus" ADD VALUE 'RETURNED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RefundStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "RefundStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "payment_refunds" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "processed_at" TIMESTAMP(3),
ADD COLUMN     "return_request_id" INTEGER;


-- CreateTable
CREATE TABLE "return_requests" (
    "id" SERIAL NOT NULL,
    "return_number" TEXT NOT NULL,
    "order_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "ReturnRequestStatus" NOT NULL DEFAULT 'RETURN_REQUESTED',
    "pickup_full_name" TEXT NOT NULL,
    "pickup_line1" TEXT NOT NULL,
    "pickup_line2" TEXT,
    "pickup_city" TEXT NOT NULL,
    "pickup_county" TEXT,
    "pickup_postcode" TEXT NOT NULL,
    "pickup_phone" TEXT,
    "courier" TEXT,
    "pickup_date" DATE,
    "pickup_window" TEXT,
    "tracking_number" TEXT,
    "pickup_notes" TEXT,
    "rejection_reason" TEXT,
    "shipping_refund" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" SERIAL NOT NULL,
    "return_request_id" INTEGER NOT NULL,
    "order_item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "ReturnReason" NOT NULL,
    "reason_other" TEXT,
    "description" TEXT,
    "approved_quantity" INTEGER,
    "received_quantity" INTEGER,
    "accepted_quantity" INTEGER,
    "condition" "ReturnItemCondition",
    "accessories_present" BOOLEAN,
    "inspection_notes" TEXT,
    "inspection_result" "ReturnInspectionResult",
    "inspection_rejection_reason" TEXT,
    "refund_amount" DECIMAL(10,2),
    "deduction_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deduction_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_item_images" (
    "id" SERIAL NOT NULL,
    "return_item_id" INTEGER NOT NULL,
    "type" "ReturnImageType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_admin_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_item_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_events" (
    "id" SERIAL NOT NULL,
    "return_request_id" INTEGER NOT NULL,
    "status" "ReturnRequestStatus",
    "action" TEXT NOT NULL,
    "note" TEXT,
    "actor_type" TEXT NOT NULL,
    "actor_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_return_number_key" ON "return_requests"("return_number");

-- CreateIndex
CREATE INDEX "return_requests_order_id_idx" ON "return_requests"("order_id");

-- CreateIndex
CREATE INDEX "return_requests_user_id_idx" ON "return_requests"("user_id");

-- CreateIndex
CREATE INDEX "return_requests_status_idx" ON "return_requests"("status");

-- CreateIndex
CREATE INDEX "return_items_return_request_id_idx" ON "return_items"("return_request_id");

-- CreateIndex
CREATE INDEX "return_items_order_item_id_idx" ON "return_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_item_images_storage_key_key" ON "return_item_images"("storage_key");

-- CreateIndex
CREATE INDEX "return_item_images_return_item_id_type_idx" ON "return_item_images"("return_item_id", "type");

-- CreateIndex
CREATE INDEX "return_events_return_request_id_idx" ON "return_events"("return_request_id");

-- CreateIndex
CREATE INDEX "payment_refunds_return_request_id_idx" ON "payment_refunds"("return_request_id");

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_item_images" ADD CONSTRAINT "return_item_images_return_item_id_fkey" FOREIGN KEY ("return_item_id") REFERENCES "return_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Migrate existing order-item returns: each becomes a return request with one item.
INSERT INTO "return_requests" ("return_number", "order_id", "user_id", "status", "pickup_full_name", "pickup_line1", "pickup_line2", "pickup_city", "pickup_county", "pickup_postcode", "pickup_phone", "rejection_reason", "created_at", "updated_at")
SELECT 'RET-' || (10000 + r."id"), oi."order_id", r."user_id",
  (CASE r."return_status"
    WHEN 'REQUESTED' THEN 'RETURN_REQUESTED' WHEN 'APPROVED' THEN 'RETURN_APPROVED' WHEN 'REJECTED' THEN 'RETURN_REJECTED'
    WHEN 'RECEIVED' THEN 'RETURN_RECEIVED' WHEN 'REFUNDED' THEN 'COMPLETED' END)::"ReturnRequestStatus",
  o."shipping_full_name", o."shipping_line1", o."shipping_line2", o."shipping_city", o."shipping_county", o."shipping_postcode", o."shipping_phone",
  CASE WHEN r."return_status" = 'REJECTED' THEN COALESCE(NULLIF(r."comment", ''), 'Rejected (no reason was recorded).') END,
  r."created_at", r."updated_at"
FROM "order_item_returns" r
JOIN "order_items" oi ON oi."id" = r."order_item_id"
JOIN "orders" o ON o."id" = oi."order_id";

INSERT INTO "return_items" ("return_request_id", "order_item_id", "quantity", "reason", "reason_other", "description", "approved_quantity", "received_quantity", "accepted_quantity", "inspection_result", "refund_amount", "created_at", "updated_at")
SELECT rr."id", r."order_item_id", oi."quantity", 'OTHER', r."reason",
  CASE WHEN r."return_status" = 'REJECTED' THEN NULL ELSE r."comment" END,
  CASE WHEN r."return_status" IN ('APPROVED', 'RECEIVED', 'REFUNDED') THEN oi."quantity" END,
  CASE WHEN r."return_status" IN ('RECEIVED', 'REFUNDED') THEN oi."quantity" END,
  CASE WHEN r."return_status" = 'REFUNDED' THEN oi."quantity" END,
  CASE WHEN r."return_status" = 'REFUNDED' THEN 'ACCEPTED'::"ReturnInspectionResult" END,
  r."refund_amount", r."created_at", r."updated_at"
FROM "order_item_returns" r
JOIN "order_items" oi ON oi."id" = r."order_item_id"
JOIN "return_requests" rr ON rr."return_number" = 'RET-' || (10000 + r."id");

-- Timeline: the request, plus its current state if it has moved on.
INSERT INTO "return_events" ("return_request_id", "status", "action", "note", "actor_type", "created_at")
SELECT rr."id", 'RETURN_REQUESTED', 'return.requested', 'Migrated from the previous returns system.', 'SYSTEM', rr."created_at" FROM "return_requests" rr;
INSERT INTO "return_events" ("return_request_id", "status", "action", "actor_type", "created_at")
SELECT rr."id", rr."status", 'return.status_changed', 'SYSTEM', rr."updated_at" FROM "return_requests" rr WHERE rr."status" <> 'RETURN_REQUESTED';

-- Refunds issued for old returns were labelled "Return request <old id>".
UPDATE "payment_refunds" pr SET "return_request_id" = rr."id"
FROM "return_requests" rr
WHERE pr."reason" = 'Return request ' || (CAST(SUBSTRING(rr."return_number" FROM 5) AS INTEGER) - 10000);
UPDATE "payment_refunds" SET "processed_at" = "updated_at" WHERE "status" = 'PROCESSED';

-- DropForeignKey
ALTER TABLE "order_item_returns" DROP CONSTRAINT "order_item_returns_order_item_id_fkey";

-- DropForeignKey
ALTER TABLE "order_item_returns" DROP CONSTRAINT "order_item_returns_user_id_fkey";

-- DropTable
DROP TABLE "order_item_returns";

-- DropEnum
DROP TYPE "PickupStatus";

-- DropEnum
DROP TYPE "ReturnStatus";
