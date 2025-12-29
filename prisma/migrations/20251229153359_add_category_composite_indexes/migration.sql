-- DropIndex
DROP INDEX "public"."categories_slug_idx";

-- CreateIndex
CREATE INDEX "categories_slug_is_active_idx" ON "categories"("slug", "is_active");

-- CreateIndex
CREATE INDEX "categories_category_type_parent_id_is_active_idx" ON "categories"("category_type", "parent_id", "is_active");
