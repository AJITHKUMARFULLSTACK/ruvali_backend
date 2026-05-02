-- One-time migration for existing DBs. If columns already exist, skip the matching lines.

ALTER TABLE product_images ADD COLUMN isPrimary TINYINT(1) NOT NULL DEFAULT 0 AFTER sortOrder;
ALTER TABLE product_images ADD COLUMN updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER createdAt;
