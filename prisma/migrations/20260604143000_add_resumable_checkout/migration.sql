ALTER TABLE "orders"
ADD COLUMN "checkout_key" TEXT,
ADD COLUMN "payment_checkout_url" TEXT,
ADD COLUMN "payment_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "orders_checkout_key_key" ON "orders"("checkout_key");
CREATE INDEX "orders_payment_expires_at_idx" ON "orders"("payment_expires_at");
