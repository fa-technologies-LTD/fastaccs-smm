import { sanitizeBuyerOrderAccounts } from './buyer-order-visibility';
import { toPublicCategory } from './public-category';

type JsonRecord = Record<string, unknown>;

const CUSTOMER_ORDER_FIELDS = [
	'id',
	'orderNumber',
	'guestEmail',
	'guestPhone',
	'subtotal',
	'taxAmount',
	'discountAmount',
	'storeCreditApplied',
	'refundedAmount',
	'totalAmount',
	'currency',
	'paymentMethod',
	'paymentReference',
	'paymentCheckoutUrl',
	'paymentExpiresAt',
	'paymentStatus',
	'paidAt',
	'deliveryMethod',
	'deliveryContact',
	'deliveryStatus',
	'deliveredAt',
	'status',
	'orderType',
	'promotionCode',
	'createdAt',
	'updatedAt',
	'paymentChannel'
] as const;

const CUSTOMER_ORDER_ITEM_FIELDS = [
	'id',
	'quantity',
	'unitPrice',
	'totalPrice',
	'refundedAmount',
	'productName',
	'productCategory',
	'allocationStatus',
	'allocatedCount',
	'createdAt',
	'updatedAt',
	'categoryId',
	'boostTargetUrl',
	'boostQuantity',
	'boostFulfillmentStatus',
	'boostCompletedAt',
	'boostIssueReason'
] as const;

const CUSTOMER_BOOST_COMPLAINT_FIELDS = ['id', 'type', 'status', 'createdAt'] as const;

const CUSTOMER_ACCOUNT_FIELDS = [
	'id',
	'platform',
	'linkUrl',
	'username',
	'password',
	'email',
	'emailPassword',
	'twoFa',
	'twoFactorEnabled',
	'easyLoginEnabled',
	'followers',
	'following',
	'postsCount',
	'engagementRate',
	'ageMonths',
	'niche',
	'qualityScore',
	'credentialExtras',
	'status',
	'deliveredAt',
	'deliveryNotes'
] as const;

function asRecord(value: unknown): JsonRecord {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function copyAllowed(source: JsonRecord, keys: readonly string[]): JsonRecord {
	const result: JsonRecord = {};
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key];
	}
	return result;
}

/** Customer order DTO. Deliberately excludes analytics, affiliate terms, cost/profit data,
 * provider references, raw category metadata and unrelated user/account internals. */
export function sanitizeCustomerOrder(order: unknown): JsonRecord {
	const raw = asRecord(order);
	const withVisibleAccounts = sanitizeBuyerOrderAccounts({
		...raw,
		status: raw.status,
		paymentStatus: raw.paymentStatus,
		orderItems: Array.isArray(raw.orderItems) ? raw.orderItems : []
	} as never) as unknown as JsonRecord;
	const result = copyAllowed(withVisibleAccounts, CUSTOMER_ORDER_FIELDS);
	const items = Array.isArray(withVisibleAccounts.orderItems) ? withVisibleAccounts.orderItems : [];
	result.orderItems = items.map((value) => {
		const item = asRecord(value);
		const safe = copyAllowed(item, CUSTOMER_ORDER_ITEM_FIELDS);
		if (Array.isArray(item.accounts)) {
			safe.accounts = item.accounts.map((account) =>
				copyAllowed(asRecord(account), CUSTOMER_ACCOUNT_FIELDS)
			);
		}
		if (Array.isArray(item.boostComplaints)) {
			safe.boostComplaints = item.boostComplaints.map((complaint) =>
				copyAllowed(asRecord(complaint), CUSTOMER_BOOST_COMPLAINT_FIELDS)
			);
		}
		if (item.boostComplaintEligibility) {
			const eligibility = asRecord(item.boostComplaintEligibility);
			safe.boostComplaintEligibility = copyAllowed(eligibility, [
				'allowedTypes',
				'refillEndsAt',
				'note'
			]);
		}
		if (item.category) safe.category = toPublicCategory(item.category);
		return safe;
	});
	return result;
}
