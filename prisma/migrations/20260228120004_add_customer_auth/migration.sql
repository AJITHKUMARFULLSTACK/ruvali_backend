-- AlterTable: Add email and password to Customer for auth
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "password" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_storeId_email_idx" ON "Customer"("storeId", "email");
