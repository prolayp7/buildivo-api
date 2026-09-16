ALTER TABLE "products"
ADD COLUMN "cost_price" DECIMAL(10,2),
ADD COLUMN "minimum_order_quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "stock_location" TEXT,
ADD COLUMN "receive_low_stock_alert" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "out_of_stock_behavior" TEXT NOT NULL DEFAULT 'DENY',
ADD COLUMN "in_stock_label" TEXT,
ADD COLUMN "out_of_stock_label" TEXT,
ADD COLUMN "availability_date" DATE;
