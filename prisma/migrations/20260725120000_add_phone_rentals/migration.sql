-- Automated verification-number (SMS/OTP) rentals fulfilled via hub-man.
-- One row per phone-type order item; order_item_id is the idempotency key.

-- CreateTable
CREATE TABLE "phone_rentals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "hub_order_uuid" TEXT,
    "service_id" INTEGER NOT NULL,
    "service_name" TEXT NOT NULL,
    "country_id" INTEGER NOT NULL,
    "country_name" TEXT NOT NULL,
    "phone_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "otp" TEXT,
    "sms_message" TEXT,
    "sender_name" TEXT,
    "cost_cents" INTEGER,
    "max_price_cents" INTEGER,
    "sale_amount_ngn" DECIMAL(65,30),
    "expires_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_rentals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "phone_rentals_order_item_id_key" ON "phone_rentals"("order_item_id");

-- CreateIndex
CREATE INDEX "phone_rentals_status_idx" ON "phone_rentals"("status");

-- CreateIndex
CREATE INDEX "phone_rentals_hub_order_uuid_idx" ON "phone_rentals"("hub_order_uuid");

-- CreateIndex
CREATE INDEX "phone_rentals_created_at_idx" ON "phone_rentals"("created_at");

-- AddForeignKey
ALTER TABLE "phone_rentals" ADD CONSTRAINT "phone_rentals_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
