CREATE TABLE "phone_supplier_catalog_routes" (
    "route_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "service_id" INTEGER NOT NULL,
    "service_name" TEXT NOT NULL,
    "country_id" INTEGER NOT NULL,
    "country_name" TEXT NOT NULL,
    "provider_service_ref" TEXT NOT NULL,
    "provider_country_ref" TEXT NOT NULL,
    "cost_cents" INTEGER NOT NULL,
    "available" INTEGER NOT NULL,
    "stock_confidence" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "unavailable_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_supplier_catalog_routes_pkey" PRIMARY KEY ("route_key")
);

CREATE INDEX "phone_supplier_catalog_routes_service_id_country_id_unavailable_idx"
ON "phone_supplier_catalog_routes"("service_id", "country_id", "unavailable_at");

CREATE INDEX "phone_supplier_catalog_routes_provider_country_id_unavailable_idx"
ON "phone_supplier_catalog_routes"("provider", "country_id", "unavailable_at");

CREATE INDEX "phone_supplier_catalog_routes_last_seen_at_idx"
ON "phone_supplier_catalog_routes"("last_seen_at");

CREATE TABLE "phone_supplier_catalog_scopes" (
    "scope_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "service_id" INTEGER NOT NULL,
    "country_id" INTEGER NOT NULL,
    "route_count" INTEGER NOT NULL,
    "refreshed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_supplier_catalog_scopes_pkey" PRIMARY KEY ("scope_key")
);

CREATE INDEX "phone_supplier_catalog_scopes_service_id_country_id_refreshed_at_idx"
ON "phone_supplier_catalog_scopes"("service_id", "country_id", "refreshed_at");

CREATE INDEX "phone_supplier_catalog_scopes_provider_country_id_refreshed_at_idx"
ON "phone_supplier_catalog_scopes"("provider", "country_id", "refreshed_at");
