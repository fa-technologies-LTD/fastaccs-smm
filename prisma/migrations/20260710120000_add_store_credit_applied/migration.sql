-- Track store credit applied per order (cash-received revenue accounting).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "store_credit_applied" DECIMAL(65,30) NOT NULL DEFAULT 0;
