/*
  Warnings:

  - You are about to drop the column `guest_telegram` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `guest_whatsapp` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `telegram_username` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `whatsapp_number` on the `users` table. All the data in the column will be lost.
  - The `user_type` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `preferred_delivery_method` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('REGISTERED', 'GUEST', 'CONVERTED', 'AFFILIATE', 'ADMIN');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('EMAIL', 'DASHBOARD');

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "guest_telegram",
DROP COLUMN "guest_whatsapp";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "telegram_username",
DROP COLUMN "whatsapp_number",
DROP COLUMN "user_type",
ADD COLUMN     "user_type" "UserType" NOT NULL DEFAULT 'REGISTERED',
DROP COLUMN "preferred_delivery_method",
ADD COLUMN     "preferred_delivery_method" "DeliveryMethod" NOT NULL DEFAULT 'EMAIL';

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
