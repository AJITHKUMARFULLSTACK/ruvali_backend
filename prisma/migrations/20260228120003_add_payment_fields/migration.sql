-- AlterTable: Add paymentId and paymentStatus to Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING';
