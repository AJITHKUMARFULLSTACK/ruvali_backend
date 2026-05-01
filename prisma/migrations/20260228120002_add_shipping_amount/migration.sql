-- AlterTable: Add shippingAmount to Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
