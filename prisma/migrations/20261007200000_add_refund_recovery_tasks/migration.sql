CREATE TABLE "refund_recovery_tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_key" TEXT NOT NULL,
  "order_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_expires_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_recovery_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refund_recovery_tasks_event_key_key" ON "refund_recovery_tasks"("event_key");
CREATE INDEX "refund_recovery_tasks_status_next_attempt_at_idx" ON "refund_recovery_tasks"("status", "next_attempt_at");
