-- One verified gateway payment must never be able to resolve to more than one order.
-- PostgreSQL permits multiple NULLs in a unique index, so unpaid/uninitialised orders
-- remain unaffected.
CREATE UNIQUE INDEX "orders_payment_reference_key" ON "orders"("payment_reference");
