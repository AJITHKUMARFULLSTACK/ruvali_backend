-- AlterTable: Add parentId to Category for hierarchical categories
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Category_parentId_idx" ON "Category"("parentId");

-- AddForeignKey (optional - Prisma may have different handling)
-- ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
