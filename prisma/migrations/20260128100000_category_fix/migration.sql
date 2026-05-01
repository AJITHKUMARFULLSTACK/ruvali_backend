-- Drop unique constraint to allow hierarchical categories (same name under different parents)
DROP INDEX IF EXISTS "Category_storeId_name_key";

-- Add foreign key for parentId (required by Prisma relation)
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_parentId_fkey";
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" 
  FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
