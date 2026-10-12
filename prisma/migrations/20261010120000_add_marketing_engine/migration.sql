-- Additive only: marketing channels, daily spend ledger, action audit log, and visit-source
-- columns on analytics_events. No existing rows are modified.
-- AlterTable
ALTER TABLE "analytics_events" ADD COLUMN     "campaign" TEXT,
ADD COLUMN     "content" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "marketing_channels" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'network',
    "status" TEXT NOT NULL DEFAULT 'testing',
    "target_cac_ngn" INTEGER,
    "daily_cap_ngn" INTEGER,
    "postback_template" TEXT,
    "dedup_by_click_id" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_channels_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "marketing_spend_daily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_key" TEXT NOT NULL,
    "campaign_key" TEXT NOT NULL DEFAULT '',
    "placement_key" TEXT NOT NULL DEFAULT '',
    "day" DATE NOT NULL,
    "spend_ngn" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "spend_usd" DECIMAL(12,4),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_spend_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_key" TEXT NOT NULL,
    "campaign_key" TEXT NOT NULL DEFAULT '',
    "placement_key" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "actor" TEXT NOT NULL DEFAULT 'system',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_spend_daily_day_idx" ON "marketing_spend_daily"("day");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_spend_daily_channel_key_campaign_key_placement_ke_key" ON "marketing_spend_daily"("channel_key", "campaign_key", "placement_key", "day");

-- CreateIndex
CREATE INDEX "marketing_actions_channel_key_created_at_idx" ON "marketing_actions"("channel_key", "created_at");

-- CreateIndex
CREATE INDEX "analytics_events_source_created_at_idx" ON "analytics_events"("source", "created_at");

-- AddForeignKey
ALTER TABLE "marketing_spend_daily" ADD CONSTRAINT "marketing_spend_daily_channel_key_fkey" FOREIGN KEY ("channel_key") REFERENCES "marketing_channels"("key") ON DELETE CASCADE ON UPDATE CASCADE;

