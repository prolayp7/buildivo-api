-- CreateTable
CREATE TABLE "product_compatibility" (
    "product_id" INTEGER NOT NULL,
    "socket" TEXT,
    "compatible_sockets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "memory_type" TEXT,
    "wattage_capacity" INTEGER,
    "wattage_required" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_compatibility_pkey" PRIMARY KEY ("product_id")
);

-- AddForeignKey
ALTER TABLE "product_compatibility" ADD CONSTRAINT "product_compatibility_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
