import { Prisma } from '@prisma/client';

/** Historical charges only; provider + order is the identity. Unknown history is not free. */
export function boostChargedCostSql() {
	return Prisma.sql`
					WITH history AS (
						SELECT a.*, ps.provider AS provider_key FROM boost_attempts a
						LEFT JOIN boost_service_routes r ON r.id=a.route_id
						LEFT JOIN boost_provider_services ps ON ps.id=r.provider_service_id
						WHERE a.fulfillment_id=f.id AND a.supplier_order_id IS NOT NULL
					), supplier_orders AS (
						SELECT DISTINCT provider_key, supplier_order_id FROM history
						WHERE type IN ('submission','status_poll')
						UNION SELECT f.provider, f.supplier_order_id WHERE f.supplier_order_id IS NOT NULL
					), latest_charges AS (
						SELECT DISTINCT ON (a.provider_key, a.supplier_order_id) a.provider_key, a.supplier_order_id, a.supplier_cost_usd
						FROM history a WHERE a.type='status_poll'
							AND a.supplier_order_id IS NOT NULL AND a.supplier_cost_usd IS NOT NULL
						ORDER BY a.provider_key, a.supplier_order_id, a.created_at DESC, a.id DESC
					), valued_orders AS (
						SELECT CASE WHEN s.provider_key IS NULL THEN NULL
							WHEN l.supplier_cost_usd IS NOT NULL THEN l.supplier_cost_usd
							WHEN s.provider_key=f.provider AND s.supplier_order_id=f.supplier_order_id
							THEN f.final_supplier_cost_usd ELSE NULL END AS charge
						FROM supplier_orders s LEFT JOIN latest_charges l USING (provider_key, supplier_order_id)
					)
					SELECT CASE WHEN count(*)=0 THEN f.final_supplier_cost_usd
						WHEN count(charge)=count(*) THEN sum(charge) ELSE NULL END AS total_usd
					FROM valued_orders
	`;
}
