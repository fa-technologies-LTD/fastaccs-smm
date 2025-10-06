/*
  Warnings:

  - You are about to drop the column `product_id` on the `cart_items` table. All the data in the column will be lost.
  - You are about to drop the column `product_id` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `product_id` on the `reviews` table. All the data in the column will be lost.
  - You are about to drop the `products` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tier_reservations` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `category_id` to the `cart_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category_id` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category_id` to the `reviews` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."cart_items" DROP CONSTRAINT "cart_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."order_items" DROP CONSTRAINT "order_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."products" DROP CONSTRAINT "products_category_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."reviews" DROP CONSTRAINT "reviews_product_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tier_reservations" DROP CONSTRAINT "tier_reservations_product_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tier_reservations" DROP CONSTRAINT "tier_reservations_user_id_fkey";

-- AlterTable
ALTER TABLE "cart_items" DROP COLUMN "product_id",
ADD COLUMN     "category_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "product_id",
ADD COLUMN     "category_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "reviews" DROP COLUMN "product_id",
ADD COLUMN     "category_id" UUID NOT NULL;

-- DropTable
DROP TABLE "public"."products";

-- DropTable
DROP TABLE "public"."tier_reservations";

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
