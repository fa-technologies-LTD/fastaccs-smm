import type { Order, OrderItem, User, Category, Account } from '@prisma/client';

// Re-export Prisma types that are used by components
export type { OrderItem };

// Extended types for order data
export interface OrderWithItems extends Order {
	items: (OrderItem & {
		category: Category;
		accounts: Account[];
	})[];
	user?: User;
}

export interface CreateOrderData {
	userId?: string;
	email: string;
	phone: string;
	items: {
		categoryId: string;
		quantity: number;
		price: number;
	}[];
	totalAmount: number;
	currency: string;
	paymentMethod: string;
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
		const errorText = await response.text();
		return { data: null, error: `HTTP ${response.status}: ${errorText}` };
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
	} = {}
) {
	try {
		const searchParams = new URLSearchParams();
		if (options.page) searchParams.set('page', options.page.toString());
		if (options.limit) searchParams.set('limit', options.limit.toString());
		if (options.status) searchParams.set('status', options.status);
		if (options.userId) searchParams.set('userId', options.userId);

		const response = await fetch(`/api/orders?${searchParams.toString()}`);
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fetch orders:', error);
		return { data: null, error: 'Failed to fetch orders' };
	}
}

// Get order by ID
export async function getOrderById(orderId: string) {
	try {
		const response = await fetch(`/api/orders/${orderId}`);
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fetch order:', error);
		return { data: null, error: 'Failed to fetch order' };
	}
}

// Get tier order details (comprehensive order information for customer view)
export async function getTierOrderDetails(orderId: string) {
	try {
		const response = await fetch(`/api/orders/${orderId}`);
		const result = await handleApiCall(response);

		if (result.error) {
			return null;
		}

		return result.data;
	} catch (error) {
		console.error('Failed to fetch tier order details:', error);
		return null;
	}
}

// Create new order
export async function createOrder(orderData: CreateOrderData) {
	try {
		const response = await fetch('/api/orders', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(orderData)
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to create order:', error);
		return { data: null, error: 'Failed to create order' };
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
			body: JSON.stringify({ status, notes })
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to update order status:', error);
		return { data: null, error: 'Failed to update order status' };
	}
}

// Cancel order
export async function cancelOrder(orderId: string, reason?: string) {
	try {
		const response = await fetch(`/api/orders/${orderId}/cancel`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ reason })
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to cancel order:', error);
		return { data: null, error: 'Failed to cancel order' };
	}
}

// Get order statistics
export async function getOrderStats(
	options: {
		startDate?: string;
		endDate?: string;
		status?: string;
	} = {}
) {
	try {
		const searchParams = new URLSearchParams();
		if (options.startDate) searchParams.set('startDate', options.startDate);
		if (options.endDate) searchParams.set('endDate', options.endDate);
		if (options.status) searchParams.set('status', options.status);

		const response = await fetch(`/api/orders/stats?${searchParams.toString()}`);
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fetch order stats:', error);
		return { data: null, error: 'Failed to fetch order stats' };
	}
}

// Get orders by user
export async function getUserOrders(
	userId: string,
	options: {
		page?: number;
		limit?: number;
		status?: string;
	} = {}
) {
	try {
		const searchParams = new URLSearchParams({ userId });
		if (options.page) searchParams.set('page', options.page.toString());
		if (options.limit) searchParams.set('limit', options.limit.toString());
		if (options.status) searchParams.set('status', options.status);

		const response = await fetch(`/api/orders?${searchParams.toString()}`);
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fetch user orders:', error);
		return { data: null, error: 'Failed to fetch user orders' };
	}
}

// Process order payment
export async function processOrderPayment(
	orderId: string,
	paymentData: {
		paymentMethod: string;
		paymentReference?: string;
		amount: number;
	}
) {
	try {
		const response = await fetch(`/api/orders/${orderId}/payment`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(paymentData)
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to process payment:', error);
		return { data: null, error: 'Failed to process payment' };
	}
}

// Fulfill order (assign accounts)
export async function fulfillOrder(orderId: string) {
	try {
		const response = await fetch(`/api/orders/${orderId}/fulfill`, {
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

// Delete order (admin only)
export async function deleteOrder(orderId: string) {
	try {
		const response = await fetch(`/api/orders/${orderId}`, {
			method: 'DELETE'
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to delete order:', error);
		return { data: null, error: 'Failed to delete order' };
	}
}

// Get order delivery details
export async function getOrderDelivery(orderId: string) {
	try {
		const response = await fetch(`/api/orders/${orderId}/delivery`);
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fetch delivery details:', error);
		return { data: null, error: 'Failed to fetch delivery details' };
	}
}

// Extended order item with account details
export interface OrderItemWithDetails extends OrderItem {
	category: Category;
	accounts: Account[];
	account_username?: string;
	account_email?: string;
	account_password?: string;
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
	created_at: Date;
	notes?: (string | OrderNote)[];
	failedDeliveryAttempts?: number;
	metadata?: {
		notes?: (string | OrderNote)[];
		customer_phone?: string;
		[key: string]: unknown;
	};
}

// Process order (allocation + preparation for delivery)
export async function processOrder(orderId: string) {
	try {
		const response = await fetch(`/api/orders/${orderId}/process`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to process order:', error);
		return { data: null, error: 'Failed to process order' };
	}
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

// Retry failed delivery
export async function retryOrderDelivery(orderId: string) {
	try {
		const response = await fetch(`/api/orders/${orderId}/retry-delivery`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to retry order delivery:', error);
		return { data: null, error: 'Failed to retry order delivery' };
	}
}
