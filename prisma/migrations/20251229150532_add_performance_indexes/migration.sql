-- CreateIndex
CREATE INDEX "account_batches_category_id_idx" ON "account_batches"("category_id");

-- CreateIndex
CREATE INDEX "account_batches_import_status_idx" ON "account_batches"("import_status");

-- CreateIndex
CREATE INDEX "account_batches_category_id_import_status_idx" ON "account_batches"("category_id", "import_status");

-- CreateIndex
CREATE INDEX "accounts_batch_id_idx" ON "accounts"("batch_id");

-- CreateIndex
CREATE INDEX "accounts_category_id_idx" ON "accounts"("category_id");

-- CreateIndex
CREATE INDEX "accounts_status_idx" ON "accounts"("status");

-- CreateIndex
CREATE INDEX "accounts_category_id_status_idx" ON "accounts"("category_id", "status");

-- CreateIndex
CREATE INDEX "accounts_status_reserved_until_idx" ON "accounts"("status", "reserved_until");

-- CreateIndex
CREATE INDEX "accounts_order_item_id_idx" ON "accounts"("order_item_id");

-- CreateIndex
CREATE INDEX "affiliate_programs_user_id_idx" ON "affiliate_programs"("user_id");

-- CreateIndex
CREATE INDEX "affiliate_programs_status_idx" ON "affiliate_programs"("status");

-- CreateIndex
CREATE INDEX "cart_items_user_id_idx" ON "cart_items"("user_id");

-- CreateIndex
CREATE INDEX "cart_items_category_id_idx" ON "cart_items"("category_id");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "categories_slug_idx" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_category_type_is_active_idx" ON "categories"("category_type", "is_active");

-- CreateIndex
CREATE INDEX "categories_is_active_sort_order_idx" ON "categories"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "commission_payouts_affiliate_program_id_idx" ON "commission_payouts"("affiliate_program_id");

-- CreateIndex
CREATE INDEX "commission_payouts_payout_date_idx" ON "commission_payouts"("payout_date");

-- CreateIndex
CREATE INDEX "microcopy_category_is_active_idx" ON "microcopy"("category", "is_active");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_created_at_idx" ON "notifications"("user_id", "read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_order_id_idx" ON "notifications"("order_id");

-- CreateIndex
CREATE INDEX "notifications_expires_at_idx" ON "notifications"("expires_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_category_id_idx" ON "order_items"("category_id");

-- CreateIndex
CREATE INDEX "order_items_allocation_status_idx" ON "order_items"("allocation_status");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "orders_payment_status_idx" ON "orders"("payment_status");

-- CreateIndex
CREATE INDEX "orders_affiliate_user_id_idx" ON "orders"("affiliate_user_id");

-- CreateIndex
CREATE INDEX "orders_affiliate_code_idx" ON "orders"("affiliate_code");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "reviews_category_id_idx" ON "reviews"("category_id");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "reviews_order_item_id_idx" ON "reviews"("order_item_id");

-- CreateIndex
CREATE INDEX "reviews_status_created_at_idx" ON "reviews"("status", "created_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "wallet_transactions_user_id_created_at_idx" ON "wallet_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_transactions_type_idx" ON "wallet_transactions"("type");

-- CreateIndex
CREATE INDEX "wallet_transactions_status_idx" ON "wallet_transactions"("status");
