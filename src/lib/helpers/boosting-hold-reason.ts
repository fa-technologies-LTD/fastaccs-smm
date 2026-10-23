const reasons: Record<string, string> = {
	confirmed_non_delivery:
		'Missing delivery was confirmed. Review the customer’s delivery or refund options.',
	link_request_withdrawn:
		'The link request was withdrawn. Choose the appropriate delivery or refund resolution.',
	admin_link_requested:
		'The customer has been asked to send a valid link. Delivery is held for support review.',
	admin_link_reply:
		'The customer has sent a replacement link for review. The original supplier target has not been changed or resubmitted.',
	provider_rejected:
		'The supplier explicitly rejected the submission. Check the order history before deciding how to resolve it.',
	balance_reservation_failed:
		'The available supplier balance could not cover this order after its safety reserve.',
	submission_order_hold:
		'This order is unpaid, cancelled, refunded or otherwise on hold. Do not send it to a supplier.',
	submission_state_changed:
		'The order state changed before submission. Check for an existing supplier reference before taking action.',
	not_approved: 'The supplier mapping has not been approved.',
	route_not_enabled: 'The supplier mapping is paused or not enabled.',
	provider_unavailable:
		'The supplier is paused, unavailable or using an unsupported account currency.',
	catalog_stale: 'Supplier catalogue information needs refreshing.',
	balance_stale: 'Supplier balance information needs refreshing.',
	service_quarantined: 'The supplier service is unavailable or quarantined.',
	offer_mismatch: 'The supplier service does not match the purchased result.',
	target_mismatch: 'The supplier requires a different kind of link.',
	unsupported_service_inputs: 'The supplier requires inputs this checkout does not support.',
	missing_verified_promise: 'A purchased service claim has not been verified for the supplier.',
	audience_mismatch: 'The supplier does not match the purchased audience.',
	refill_mismatch: 'The supplier does not have the verified refill cover that was purchased.',
	quantity_out_of_range: 'The purchased quantity is outside the supplier’s limits.',
	pilot_limit_exceeded: 'The quantity exceeds the configured trial limit.',
	insufficient_balance: 'The recorded supplier balance is insufficient after its safety reserve.',
	below_reliability_floor:
		'Recorded delivery reliability is below the existing safety requirement.',
	cost_cap_exceeded: 'Supplier cost exceeds the approved spending limit.',
	margin_floor_breached: 'Supplier cost would breach the saved profit safety requirement.',
	target_review_needed: 'This share link needs manual review.',
	invalid_target: 'The customer link does not match the purchased service.',
	invalid_offer_snapshot: 'The saved purchase details are incomplete. Review the original order.',
	invalid_custom_comments: 'The saved custom comments need review.',
	submission_unknown:
		'Supplier submission is uncertain. Check the supplier before taking further action; do not submit again.',
	missing_supplier_reference:
		'The supplier reference is missing. Check the supplier before taking further action.',
	status_check_failed: 'The last supplier status check failed. Delivery is not confirmed.',
	target_already_active: 'Another active order exists for this same link and result.',
	provider_partial:
		'The supplier reports partial delivery. Check the remaining quantity before resolving this order.',
	provider_cancelled:
		'The supplier reports cancellation. Check recorded charges and delivery before refunding.',
	provider_failed:
		'The supplier reports failure. Check recorded delivery and charges before resolving this order.'
};

/** Only allowlisted messages leave the server; never expose raw supplier responses or summaries. */
export function boostHoldReasons(attention: string | null, summary?: unknown): string[] {
	if (!attention || attention === 'shadow_selected') return [];
	if (attention !== 'no_safe_route')
		return [
			reasons[attention] ??
				'This order needs manual review. Check its recorded history before taking action.'
		];
	const record =
		summary && typeof summary === 'object' && !Array.isArray(summary)
			? (summary as Record<string, unknown>)
			: null;
	const projections = Array.isArray(record?.projections) ? record.projections : [];
	const messages = projections.flatMap((projection: unknown) => {
		if (
			!projection ||
			typeof projection !== 'object' ||
			!('reasons' in projection) ||
			!Array.isArray(projection.reasons)
		)
			return [];
		return projection.reasons.flatMap((key: unknown) =>
			typeof key === 'string' && reasons[key] ? [reasons[key]] : []
		);
	});
	return [...new Set(messages)].slice(0, 12).length
		? [...new Set(messages)].slice(0, 12)
		: [
				'No supplier passed the last recorded checks. Detailed reasons were not recorded; review supplier setup and order history.'
			];
}
