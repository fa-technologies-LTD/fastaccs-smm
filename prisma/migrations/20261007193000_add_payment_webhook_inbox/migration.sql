CREATE TABLE "payment_webhook_inbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_expires_at" TIMESTAMP(3),
    "last_error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    CONSTRAINT "payment_webhook_inbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_webhook_inbox_event_key_key" ON "payment_webhook_inbox"("event_key");
CREATE INDEX "payment_webhook_inbox_status_next_attempt_at_idx" ON "payment_webhook_inbox"("status", "next_attempt_at");
