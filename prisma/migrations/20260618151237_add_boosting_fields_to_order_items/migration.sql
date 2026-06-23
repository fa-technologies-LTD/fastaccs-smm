-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "boost_completed_at" TIMESTAMP(3),
ADD COLUMN     "boost_fulfillment_status" TEXT,
ADD COLUMN     "boost_provider_reference" TEXT,
ADD COLUMN     "boost_quantity" INTEGER,
ADD COLUMN     "boost_target_url" TEXT;

-- CreateIndex
CREATE INDEX "order_items_boost_fulfillment_status_idx" ON "order_items"("boost_fulfillment_status");
