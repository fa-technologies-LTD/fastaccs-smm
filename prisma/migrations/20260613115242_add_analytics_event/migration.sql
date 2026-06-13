-- AlterTable
ALTER TABLE "promotion_codes" ALTER COLUMN "platform_ids" DROP DEFAULT;

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_events_type_created_at_idx" ON "analytics_events"("type", "created_at");

-- RenameIndex
ALTER INDEX "idx_notifications_status" RENAME TO "email_notifications_status_idx";

-- RenameIndex
ALTER INDEX "idx_notifications_type" RENAME TO "email_notifications_notification_type_idx";

-- RenameIndex
ALTER INDEX "idx_notifications_user" RENAME TO "email_notifications_user_id_idx";
