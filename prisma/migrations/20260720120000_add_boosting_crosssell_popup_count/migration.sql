-- Additive: track how many times the boosting cross-sell popup has been shown
-- to a buyer (gates it to their first 3 orders). Backward-compatible, default 0.
ALTER TABLE "users" ADD COLUMN "boosting_cross_sell_popup_seen_count" INTEGER NOT NULL DEFAULT 0;
