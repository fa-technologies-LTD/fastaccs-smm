-- Additive, inert foundation for the dual-provider Boosting system. No trigger, cron or route in
-- this migration can submit a supplier order. Existing manual Boosting fields remain untouched.

CREATE TABLE "boost_provider_states" (
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "circuit_open" BOOLEAN NOT NULL DEFAULT false,
    "pause_reason" TEXT,
    "balance" DECIMAL(18,6),
    "projected_balance" DECIMAL(18,6),
    "currency" TEXT,
    "catalogue_service_count" INTEGER NOT NULL DEFAULT 0,
    "catalogue_fingerprint" TEXT,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_catalogue_success_at" TIMESTAMP(3),
    "last_balance_success_at" TIMESTAMP(3),
    "last_api_success_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "boost_provider_states_pkey" PRIMARY KEY ("provider")
);

CREATE TABLE "boost_provider_services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "provider_type" TEXT,
    "rate_per_thousand" DECIMAL(18,6),
    "min_quantity" INTEGER,
    "max_quantity" INTEGER,
    "refill_advertised" BOOLEAN,
    "cancel_advertised" BOOLEAN,
    "dripfeed_advertised" BOOLEAN,
    "platforms" TEXT[],
    "outcomes" TEXT[],
    "target_type" TEXT NOT NULL,
    "quality_signals" TEXT[],
    "anomalies" TEXT[],
    "catalogue_status" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unavailable_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "boost_provider_services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "boost_customer_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "audience_tag" TEXT,
    "quality_tier" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "short_promise" TEXT NOT NULL,
    "expectation_chips" TEXT[],
    "min_quantity" INTEGER NOT NULL,
    "step_quantity" INTEGER NOT NULL,
    "quantity_presets" INTEGER[],
    "price_per_step_ngn" DECIMAL(10,2) NOT NULL,
    "required_verified_signals" TEXT[],
    "refill_days" INTEGER,
    "minimum_margin_percent" DECIMAL(5,2) NOT NULL,
    "normal_cost_target_ngn" DECIMAL(10,2) NOT NULL,
    "maximum_supplier_cost_ngn" DECIMAL(10,2) NOT NULL,
    "attempt_cap" INTEGER NOT NULL DEFAULT 1,
    "recovery_modes" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'hidden',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "routing_policy" TEXT NOT NULL DEFAULT 'automatic',
    "preferred_route_id" UUID,
    "locked_route_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "boost_customer_offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "boost_service_routes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "offer_id" UUID NOT NULL,
    "provider_service_id" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'shadow',
    "equivalence_approved" BOOLEAN NOT NULL DEFAULT false,
    "equivalence_label" TEXT,
    "target_type" TEXT NOT NULL,
    "verified_signals" TEXT[],
    "audience_tags" TEXT[],
    "verified_refill_days" INTEGER,
    "minimum_quantity" INTEGER NOT NULL,
    "maximum_quantity" INTEGER NOT NULL,
    "quantity_step" INTEGER,
    "maximum_pilot_quantity" INTEGER,
    "expected_recovery_cost_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "reliability_score" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "reliability_observations" INTEGER NOT NULL DEFAULT 0,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "boost_service_routes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "boost_fulfillments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "offer_id" UUID,
    "selected_route_id" UUID,
    "offer_snapshot" JSONB NOT NULL,
    "target_url" TEXT NOT NULL,
    "target_key" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "customer_price_ngn" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "customer_status" TEXT NOT NULL DEFAULT 'processing',
    "fulfillment_mode" TEXT NOT NULL DEFAULT 'manual',
    "provider" TEXT,
    "provider_service_snapshot" JSONB,
    "supplier_order_id" TEXT,
    "quoted_supplier_cost_usd" DECIMAL(18,6),
    "final_supplier_cost_usd" DECIMAL(18,6),
    "fx_ngn_per_usd" DECIMAL(18,6),
    "maximum_supplier_cost_ngn" DECIMAL(10,2) NOT NULL,
    "projected_margin_ngn" DECIMAL(10,2),
    "final_margin_ngn" DECIMAL(10,2),
    "start_count" INTEGER,
    "remains" INTEGER,
    "raw_provider_status" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "attempt_cap" INTEGER NOT NULL DEFAULT 1,
    "lease_token" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "next_action_at" TIMESTAMP(3),
    "last_safe_error_category" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "boost_fulfillments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "boost_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fulfillment_id" UUID NOT NULL,
    "route_id" UUID,
    "type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "request_fingerprint" TEXT,
    "supplier_order_id" TEXT,
    "supplier_cost_usd" DECIMAL(18,6),
    "safe_summary" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "boost_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "boost_provider_services_provider_service_id_key" ON "boost_provider_services"("provider", "service_id");
CREATE INDEX "boost_provider_states_enabled_circuit_open_idx" ON "boost_provider_states"("enabled", "circuit_open");
CREATE INDEX "boost_provider_services_provider_catalogue_status_idx" ON "boost_provider_services"("provider", "catalogue_status");
CREATE INDEX "boost_provider_services_platforms_idx" ON "boost_provider_services" USING GIN ("platforms");
CREATE INDEX "boost_provider_services_outcomes_idx" ON "boost_provider_services" USING GIN ("outcomes");
CREATE INDEX "boost_provider_services_last_seen_at_idx" ON "boost_provider_services"("last_seen_at");
CREATE UNIQUE INDEX "boost_customer_offers_category_id_key" ON "boost_customer_offers"("category_id");
CREATE INDEX "boost_customer_offers_platform_outcome_status_display_order_idx" ON "boost_customer_offers"("platform", "outcome", "status", "display_order");
CREATE INDEX "boost_customer_offers_routing_policy_idx" ON "boost_customer_offers"("routing_policy");
CREATE UNIQUE INDEX "boost_service_routes_offer_id_provider_service_id_key" ON "boost_service_routes"("offer_id", "provider_service_id");
CREATE INDEX "boost_service_routes_offer_id_state_idx" ON "boost_service_routes"("offer_id", "state");
CREATE INDEX "boost_service_routes_provider_service_id_idx" ON "boost_service_routes"("provider_service_id");
CREATE INDEX "boost_service_routes_reviewed_by_user_id_idx" ON "boost_service_routes"("reviewed_by_user_id");
CREATE UNIQUE INDEX "boost_fulfillments_order_item_id_key" ON "boost_fulfillments"("order_item_id");
CREATE INDEX "boost_fulfillments_status_next_action_at_idx" ON "boost_fulfillments"("status", "next_action_at");
CREATE INDEX "boost_fulfillments_provider_status_idx" ON "boost_fulfillments"("provider", "status");
CREATE INDEX "boost_fulfillments_offer_id_idx" ON "boost_fulfillments"("offer_id");
CREATE INDEX "boost_fulfillments_selected_route_id_idx" ON "boost_fulfillments"("selected_route_id");
CREATE INDEX "boost_fulfillments_target_key_outcome_idx" ON "boost_fulfillments"("target_key", "outcome");
CREATE INDEX "boost_attempts_fulfillment_id_created_at_idx" ON "boost_attempts"("fulfillment_id", "created_at");
CREATE INDEX "boost_attempts_route_id_created_at_idx" ON "boost_attempts"("route_id", "created_at");
CREATE INDEX "boost_attempts_type_created_at_idx" ON "boost_attempts"("type", "created_at");

ALTER TABLE "boost_provider_services" ADD CONSTRAINT "boost_provider_services_provider_fkey" FOREIGN KEY ("provider") REFERENCES "boost_provider_states"("provider") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "boost_customer_offers" ADD CONSTRAINT "boost_customer_offers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "boost_service_routes" ADD CONSTRAINT "boost_service_routes_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "boost_customer_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "boost_service_routes" ADD CONSTRAINT "boost_service_routes_provider_service_id_fkey" FOREIGN KEY ("provider_service_id") REFERENCES "boost_provider_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "boost_service_routes" ADD CONSTRAINT "boost_service_routes_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "boost_customer_offers" ADD CONSTRAINT "boost_customer_offers_preferred_route_id_fkey" FOREIGN KEY ("preferred_route_id") REFERENCES "boost_service_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "boost_customer_offers" ADD CONSTRAINT "boost_customer_offers_locked_route_id_fkey" FOREIGN KEY ("locked_route_id") REFERENCES "boost_service_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "boost_fulfillments" ADD CONSTRAINT "boost_fulfillments_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "boost_fulfillments" ADD CONSTRAINT "boost_fulfillments_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "boost_customer_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "boost_fulfillments" ADD CONSTRAINT "boost_fulfillments_selected_route_id_fkey" FOREIGN KEY ("selected_route_id") REFERENCES "boost_service_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "boost_attempts" ADD CONSTRAINT "boost_attempts_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "boost_fulfillments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "boost_attempts" ADD CONSTRAINT "boost_attempts_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "boost_service_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prevent two real fulfilments from actively working the same target/outcome at once. Shadow rows
-- are observations only and must not block a later customer order. Manual review can resolve a
-- legitimate follow-up after the earlier fulfilment reaches a terminal state.
CREATE UNIQUE INDEX "boost_fulfillments_active_target_guard"
ON "boost_fulfillments"("target_key", "outcome")
WHERE "fulfillment_mode" <> 'shadow'
  AND "status" IN (
    'queued',
    'routing',
    'submitting',
    'submission_unknown',
    'submitted',
    'pending',
    'in_progress',
    'partial',
    'refill_requested',
    'needs_link',
    'manual_review'
  );
