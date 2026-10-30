import type { Order, OrderItem, User, Category, Account } from '@prisma/client';
import type { CheckoutQuote } from '$lib/helpers/checkout-quote';

// Re-export Prisma types that are used by components
export type { OrderItem };

export interface CreateOrderData {
	userId?: string;
	email: string;
	phone: string;
	items: {
		categoryId: string;
		quantity: number;
		price?: number;
		exactAccountId?: string;
		exactAccountLabel?: string;
		boostTargetUrl?: string;
		boostQuantity?: number;
		boostOfferId?: string | null;
		accountAddonKey?: string;
	}[];
	totalAmount: number;
	acceptedQuote?: CheckoutQuote;
	currency: string;
	paymentMethod: string;
	checkoutKey?: string;
	affiliateCode?: string;
	promotionCode?: string;
	useStoreCredit?: boolean;
	analytics?: {
		ga4ClientId?: string | null;
		consentGranted?: boolean;
	};
}

export interface OrderSummary {
	id: string;
	orderNumber: string;
	status: string;
	totalAmount: number;
	currency: string;
	createdAt: Date;
	itemCount: number;
}

// Helper function to handle API responses
async function handleApiCall(response: Response) {
	if (!response.ok) {
		const raw = await response.text();
		let errorText = raw;
		let traceId = '';
		let orderId = '';
		let details: {
			code?: string;
			quote?: CheckoutQuote;
			categoryId?: string;
			boostOfferId?: string;
		} = {};
		try {
			const parsed = JSON.parse(raw) as {
				error?: unknown;
				message?: unknown;
				traceId?: unknown;
				orderId?: unknown;
				code?: string;
				quote?: CheckoutQuote;
				categoryId?: string;
				boostOfferId?: string;
			};
			errorText = String(parsed.error || parsed.message || raw);
			traceId = typeof parsed.traceId === 'string' ? parsed.traceId.trim().slice(0, 100) : '';
			orderId = typeof parsed.orderId === 'string' ? parsed.orderId.trim() : '';
			details = {
				code: parsed.code,
				quote: parsed.quote,
				categoryId: parsed.categoryId,
				boostOfferId: parsed.boostOfferId
			};
		} catch {
			errorText = raw;
		}
		const reference = traceId ? ` Reference: ${traceId}` : '';
		return {
			data: null,
			...details,
			error: `HTTP ${response.status}: ${errorText}${reference}`,
			...(orderId ? { orderId } : {})
		};
	}
	return await response.json();
}

// Get all orders with pagination
export async function getOrders(
	options: {
		page?: number;
		limit?: number;
		status?: string;
		userId?: string;
		type?: 'account' | 'boosting';
		/** Admin list rows only: no login details. */
		view?: 'list';
	} = {},
	fetchFn: typeof fetch = fetch
) {
	try {
		const searchParams = new URLSearchParams();
		if (options.page) searchParams.set('page', options.page.toString());
		if (options.limit) searchParams.set('limit', options.limit.toString());
		if (options.status) searchParams.set('status', options.status);
		if (options.userId) searchParams.set('userId', options.userId);
		if (options.type) searchParams.set('type', options.type);
		if (options.view) searchParams.set('view', options.view);

		const response = await fetchFn(`/api/orders?${searchParams.toString()}`);
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fetch orders:', error);
		return { data: null, error: 'Failed to fetch orders' };
	}
}

// Get order by ID
export async function getOrderById(orderId: string, fetchFn: typeof fetch = fetch) {
	try {
		const response = await fetchFn(`/api/orders/${orderId}`);
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fetch order:', error);
		return { data: null, error: 'Failed to fetch order' };
	}
}

// Create new order
export async function createOrder(
	orderData: CreateOrderData,
	options: { signal?: AbortSignal } = {}
) {
	try {
		const response = await fetch('/api/orders', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(orderData),
			signal: options.signal
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to create order:', error);
		if (error instanceof DOMException && error.name === 'AbortError') {
			return {
				data: null,
				error: 'Checkout response timed out',
				unknownOutcome: true
			};
		}
		return { data: null, error: 'Failed to create order', unknownOutcome: true };
	}
}

// Update order status
export async function updateOrderStatus(orderId: string, status: string, notes?: string) {
	try {
		const response = await fetch(`/api/orders/${orderId}`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ status })
		});
		if (response.ok && notes && notes.trim()) {
			void addOrderNote(orderId, notes.trim());
		}
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to update order status:', error);
		return { data: null, error: 'Failed to update order status' };
	}
}

// Get order statistics
export async function getOrderStats(
	options: {
		startDate?: string;
		endDate?: string;
		status?: string;
	} = {},
	fetchFn: typeof fetch = fetch
) {
	try {
		const searchParams = new URLSearchParams();
		if (options.startDate) searchParams.set('startDate', options.startDate);
		if (options.endDate) searchParams.set('endDate', options.endDate);
		if (options.status) searchParams.set('status', options.status);

		const response = await fetchFn(`/api/orders/stats?${searchParams.toString()}`);
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fetch order stats:', error);
		return { data: null, error: 'Failed to fetch order stats' };
	}
}

// Fulfill order (assign accounts)
export async function fulfillOrder(orderId: string) {
	try {
		const response = await fetch(`/api/orders/${orderId}/process`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fulfill order:', error);
		return { data: null, error: 'Failed to fulfill order' };
	}
}

// Extended order item with account details
export interface OrderItemWithDetails extends OrderItem {
	category: Category;
	accounts: Account[];
	account_username?: string;
	account_email?: string;
	account_password?: string;
	account_email_password?: string;
	account_two_fa?: string;
	account_link_url?: string;
	account_credential_extras?: Record<string, string>;
	account_status?: string;
	account_delivery_notes?: string | null;
	account_created_at?: string | Date | null;
	account_delivered_at?: string | Date | null;
	platform_name?: string;
	tier_name?: string;
}

// Order note structure
export interface OrderNote {
	note: string;
	created_at: string;
	author: string;
}

// Order metadata for admin dashboard
export interface OrderMetadata extends Order {
	items: OrderItemWithDetails[];
	user?: User;
	itemCount: number;
	item_count: number;
	customer_email?: string;
	customer_name?: string;
	payment_id?: string;
	total_amount: number;
	net_sale_amount: number;
	refunded_amount: number;
	created_at: Date;
	notes?: (string | OrderNote)[];
	failedDeliveryAttempts?: number;
	metadata?: {
		notes?: (string | OrderNote)[];
		customer_phone?: string;
		[key: string]: unknown;
	};
}

// Process order delivery (send credentials to customer)
export async function processOrderDelivery(
	orderId: string,
	deliveryMethod: 'email' | 'whatsapp' | 'telegram'
) {
	try {
		const response = await fetch(`/api/orders/${orderId}/deliver`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ deliveryMethod })
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to process order delivery:', error);
		return { data: null, error: 'Failed to process order delivery' };
	}
}

// Add note to order
export async function addOrderNote(orderId: string, note: string) {
	try {
		const response = await fetch(`/api/orders/${orderId}/notes`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ note })
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to add order note:', error);
		return { data: null, error: 'Failed to add order note' };
	}
}
