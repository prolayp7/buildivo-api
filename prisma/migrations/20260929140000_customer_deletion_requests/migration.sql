CREATE TYPE "CustomerDeletionRequestStatus" AS ENUM ('PENDING', 'COMPLETED');

CREATE TABLE "customer_deletion_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "CustomerDeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "customer_deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_deletion_requests_status_requested_at_idx" ON "customer_deletion_requests"("status", "requested_at");
CREATE INDEX "customer_deletion_requests_user_id_status_idx" ON "customer_deletion_requests"("user_id", "status");

ALTER TABLE "customer_deletion_requests" ADD CONSTRAINT "customer_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;CREATE TYPE "CustomerDeletionRequestStatus" AS ENUM ('PENDING', 'COMPLETED');

CREATE TABLE "customer_deletion_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "CustomerDeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "customer_deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_deletion_requests_status_requested_at_idx" ON "customer_deletion_requests"("status", "requested_at");
CREATE INDEX "customer_deletion_requests_user_id_status_idx" ON "customer_deletion_requests"("user_id", "status");

ALTER TABLE "customer_deletion_requests" ADD CONSTRAINT "customer_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;