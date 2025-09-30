import { supabase } from '$lib/supabase';
import type { CartItem } from '$lib/stores/cart';
import { removeTierReservation } from './reservations';

// Types for order management
export interface OrderMetadata {
	id: string;
	customer_email: string;
	customer_name?: string;
	payment_id?: string;
	total_amount: number;
	item_count: number;
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
	created_at: string;
	updated_at: string;
	metadata?: {
		platform?: string;
		tier_info?: Record<string, unknown>;
		payment_method?: string;
		customer_phone?: string;
		delivery_method?: 'email' | 'whatsapp' | 'telegram';
		notes?: Array<{
			note: string;
			created_at: string;
			author: string;
		}>;
	};
}

export interface OrderItem {
	id: string;
	order_id: string;
	account_id: string;
	account_username: string;
	account_email?: string;
	account_password?: string;
	platform_name: string;
	tier_name: string;
	price: number;
	status: 'allocated' | 'delivered' | 'failed';
	created_at: string;
}

export interface OrderInsert {
	customer_email: string;
	customer_name?: string;
	payment_id?: string;
	total_amount: number;
	item_count: number;
	status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
	metadata?: Record<string, unknown>;
}

export interface OrderUpdate {
	customer_email?: string;
	customer_name?: string;
	payment_id?: string;
	total_amount?: number;
	item_count?: number;
	status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
	metadata?: Record<string, unknown>;
}

// Get all orders
export async function getOrders() {
	try {
		const { data, error } = await supabase
			.from('orders')
			.select('*')
			.order('created_at', { ascending: false });

		return { data, error };
	} catch (error) {
		console.error('Error fetching orders:', error);
		return { data: null, error: { message: 'Failed to fetch orders' } };
	}
}

// Note: getOrderById function moved to Phase 5 section below with enhanced functionality

// Create new order
export async function createOrder(orderData: OrderInsert) {
	try {
		const { data, error } = await supabase
			.from('orders')
			.insert([
				{
					...orderData,
					id: crypto.randomUUID(),
					status: orderData.status || 'pending'
				}
			])
			.select()
			.single();

		return { data, error };
	} catch (error) {
		console.error('Error creating order:', error);
		return { data: null, error: { message: 'Failed to create order' } };
	}
}

// Update order
export async function updateOrder(id: string, updates: OrderUpdate) {
	try {
		const { data, error } = await supabase
			.from('orders')
			.update(updates)
			.eq('id', id)
			.select()
			.single();

		return { data, error };
	} catch (error) {
		console.error('Error updating order:', error);
		return { data: null, error: { message: 'Failed to update order' } };
	}
}

// Update order status
export async function updateOrderStatus(id: string, status: string) {
	try {
		const { data, error } = await supabase
			.from('orders')
			.update({
				status,
				updated_at: new Date().toISOString()
			})
			.eq('id', id)
			.select()
			.single();

		return { data, error };
	} catch (error) {
		console.error('Error updating order status:', error);
		return { data: null, error: { message: 'Failed to update order status' } };
	}
}

// Process order (allocate accounts)
export async function processOrder(id: string) {
	try {
		// This would typically call a stored procedure or complex logic
		// For now, just update status to processing
		const { data, error } = await supabase
			.from('orders')
			.update({
				status: 'processing',
				updated_at: new Date().toISOString()
			})
			.eq('id', id)
			.select()
			.single();

		// In a real implementation, this would:
		// 1. Get order items
		// 2. Allocate available accounts from the requested tiers
		// 3. Reserve accounts for this order
		// 4. Update order status to completed when done

		return { data, error };
	} catch (error) {
		console.error('Error processing order:', error);
		return { data: null, error: { message: 'Failed to process order' } };
	}
}

// Delete order
export async function deleteOrder(id: string) {
	try {
		const { data, error } = await supabase.from('orders').delete().eq('id', id);

		return { data, error };
	} catch (error) {
		console.error('Error deleting order:', error);
		return { data: null, error: { message: 'Failed to delete order' } };
	}
}

// Get orders by status
export async function getOrdersByStatus(status: string) {
	try {
		const { data, error } = await supabase
			.from('orders')
			.select('*')
			.eq('status', status)
			.order('created_at', { ascending: false });

		return { data, error };
	} catch (error) {
		console.error('Error fetching orders by status:', error);
		return { data: null, error: { message: 'Failed to fetch orders' } };
	}
}

// Get orders by customer
export async function getOrdersByCustomer(customerEmail: string) {
	try {
		const { data, error } = await supabase
			.from('orders')
			.select('*')
			.eq('customer_email', customerEmail)
			.order('created_at', { ascending: false });

		return { data, error };
	} catch (error) {
		console.error('Error fetching customer orders:', error);
		return { data: null, error: { message: 'Failed to fetch customer orders' } };
	}
}

// ========== Phase 5: Enhanced Order Management Functions ==========

// Get order by ID with full details
export async function getOrderById(orderId: string) {
	try {
		const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).single();

		return { data, error };
	} catch (error) {
		console.error('Error fetching order by ID:', error);
		return { data: null, error: { message: 'Failed to fetch order' } };
	}
}

// Get order items (allocated accounts)
export async function getOrderItems(orderId: string) {
	try {
		// This would typically join with order_items and accounts tables
		// For now, we'll return mock data structure
		const { data, error } = await supabase
			.from('order_items')
			.select(
				`
				*,
				account:accounts(
					id,
					username,
					email,
					password,
					category:categories(
						name,
						parent:categories(name)
					)
				)
			`
			)
			.eq('order_id', orderId);

		if (error) {
			return { data: null, error };
		}

		// Transform the data to match OrderItem interface
		const items: OrderItem[] = (data || []).map((item) => {
			const account = item.account as Record<string, unknown> | null;
			const category = account?.category as Record<string, unknown> | null;
			const parent = category?.parent as Record<string, unknown> | null;

			return {
				id: item.id as string,
				order_id: item.order_id as string,
				account_id: item.account_id as string,
				account_username: (account?.username as string) || 'Unknown',
				account_email: (account?.email as string) || '',
				account_password: (account?.password as string) || '',
				platform_name: (parent?.name as string) || 'Unknown',
				tier_name: (category?.name as string) || 'Unknown',
				price: (item.price as number) || 0,
				status: (item.status as 'allocated' | 'delivered' | 'failed') || 'allocated',
				created_at: item.created_at as string
			};
		});

		return { data: items, error: null };
	} catch (error) {
		console.error('Error fetching order items:', error);
		return { data: null, error: { message: 'Failed to fetch order items' } };
	}
}

// Process order delivery
export async function processOrderDelivery(
	orderId: string,
	deliveryMethod: 'email' | 'whatsapp' | 'telegram'
) {
	try {
		// Update order metadata with delivery method
		const { data, error } = await supabase
			.from('orders')
			.update({
				metadata: {
					delivery_method: deliveryMethod,
					delivery_initiated_at: new Date().toISOString()
				},
				status: 'processing',
				updated_at: new Date().toISOString()
			})
			.eq('id', orderId)
			.select()
			.single();

		if (error) {
			return { data: null, error };
		}

		// Here you would typically integrate with actual delivery services
		// For now, we'll just simulate the delivery process
		console.log(`Initiating ${deliveryMethod} delivery for order ${orderId}`);

		return { data, error: null };
	} catch (error) {
		console.error('Error processing delivery:', error);
		return { data: null, error: { message: 'Failed to process delivery' } };
	}
}

// Add note to order
export async function addOrderNote(orderId: string, note: string) {
	try {
		// First, get the current order to append to existing notes
		const { data: currentOrder, error: fetchError } = await supabase
			.from('orders')
			.select('metadata')
			.eq('id', orderId)
			.single();

		if (fetchError) {
			return { data: null, error: fetchError };
		}

		const currentMetadata = currentOrder.metadata || {};
		const currentNotes = currentMetadata.notes || [];

		const newNote = {
			note,
			created_at: new Date().toISOString(),
			author: 'Admin'
		};

		const updatedMetadata = {
			...currentMetadata,
			notes: [...currentNotes, newNote]
		};

		const { data, error } = await supabase
			.from('orders')
			.update({
				metadata: updatedMetadata,
				updated_at: new Date().toISOString()
			})
			.eq('id', orderId)
			.select()
			.single();

		return { data, error };
	} catch (error) {
		console.error('Error adding order note:', error);
		return { data: null, error: { message: 'Failed to add note' } };
	}
}

// Get order statistics for dashboard
export async function getOrderStats() {
	try {
		const { data, error } = await supabase
			.from('orders')
			.select('status, total_amount, created_at');

		if (error) {
			return { data: null, error };
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const stats = {
			total_orders: data.length,
			pending_orders: data.filter((o) => o.status === 'pending').length,
			processing_orders: data.filter((o) => o.status === 'processing').length,
			completed_orders: data.filter((o) => o.status === 'completed').length,
			failed_orders: data.filter((o) => o.status === 'failed').length,
			todays_orders: data.filter((o) => new Date(o.created_at) >= today).length,
			total_revenue: data
				.filter((o) => o.status === 'completed')
				.reduce((sum, o) => sum + o.total_amount, 0),
			todays_revenue: data
				.filter((o) => o.status === 'completed' && new Date(o.created_at) >= today)
				.reduce((sum, o) => sum + o.total_amount, 0)
		};

		return { data: stats, error: null };
	} catch (error) {
		console.error('Error fetching order stats:', error);
		return { data: null, error: { message: 'Failed to fetch order statistics' } };
	}
}

// NEW TIER-BASED ORDER SYSTEM
// ============================================================================

export interface TierOrderCreationData {
	userId?: string;
	guestEmail?: string;
	guestName?: string;
	deliveryMethod: 'email' | 'whatsapp' | 'telegram';
	whatsappNumber?: string;
	telegramUsername?: string;
	items: CartItem[];
	total: number;
}

export interface TierOrderResult {
	success: boolean;
	orderId?: string;
	error?: string;
}

/**
 * Create a new tier-based order and process account allocation
 */
export async function createTierOrder(orderData: TierOrderCreationData): Promise<TierOrderResult> {
	try {
		// Start transaction
		const { data: order, error: orderError } = await supabase
			.from('orders')
			.insert([
				{
					user_id: orderData.userId,
					guest_email: orderData.guestEmail,
					guest_name: orderData.guestName,
					delivery_method: orderData.deliveryMethod,
					whatsapp_number: orderData.whatsappNumber,
					telegram_username: orderData.telegramUsername,
					total: orderData.total,
					status: 'pending'
				}
			])
			.select()
			.single();

		if (orderError || !order) {
			console.error('Error creating order:', orderError);
			return { success: false, error: 'Failed to create order' };
		}

		// Create order items
		const orderItems = orderData.items.map((item) => ({
			order_id: order.id,
			product_id: item.product.id,
			quantity: item.quantity,
			price: item.product.price,
			allocation_status: 'pending',
			allocated_count: 0
		}));

		const { data: createdItems, error: itemsError } = await supabase
			.from('order_items')
			.insert(orderItems)
			.select();

		if (itemsError || !createdItems) {
			console.error('Error creating order items:', itemsError);
			return { success: false, error: 'Failed to create order items' };
		}

		// Process account allocation for each item
		const allocationResults = [];
		for (const item of createdItems) {
			try {
				const { error: allocError } = await supabase.rpc('allocate_accounts_for_order_item', {
					p_order_item_id: item.id
				});

				if (allocError) {
					console.error('Error allocating accounts for item:', item.id, allocError);
					allocationResults.push({ success: false, itemId: item.id, error: allocError.message });
				} else {
					allocationResults.push({ success: true, itemId: item.id });
				}
			} catch (error) {
				console.error('Error calling allocation function:', error);
				allocationResults.push({ success: false, itemId: item.id, error: 'Allocation failed' });
			}
		}

		// Clean up reservations for successful allocations
		for (const cartItem of orderData.items) {
			if (cartItem.reservation?.id) {
				await removeTierReservation(cartItem.reservation.id);
			}
		}

		// Check overall allocation status
		const failedAllocations = allocationResults.filter((r) => !r.success);
		let finalStatus = 'completed';

		if (failedAllocations.length === allocationResults.length) {
			finalStatus = 'failed';
		} else if (failedAllocations.length > 0) {
			finalStatus = 'partial';
		}

		// Update order status
		await supabase.from('orders').update({ status: finalStatus }).eq('id', order.id);

		// TODO: Send notification email with account details
		if (finalStatus !== 'failed') {
			await sendTierOrderNotification(order.id, orderData);
		}

		return {
			success: finalStatus !== 'failed',
			orderId: order.id,
			error: finalStatus === 'failed' ? 'Could not allocate any accounts' : undefined
		};
	} catch (error) {
		console.error('Error processing tier order:', error);
		return { success: false, error: 'Order processing failed' };
	}
}

/**
 * Send tier order notification (placeholder for email integration)
 */
async function sendTierOrderNotification(
	orderId: string,
	orderData: TierOrderCreationData
): Promise<void> {
	try {
		// Get order details with allocated accounts
		const { data: orderDetails, error } = await supabase
			.from('orders')
			.select(
				`
				*,
				order_items (
					*,
					products (
						title,
						platform,
						tier_name,
						follower_count
					),
					accounts (
						username,
						password,
						email,
						additional_info
					)
				)
			`
			)
			.eq('id', orderId)
			.single();

		if (error || !orderDetails) {
			console.error('Error fetching order details for notification:', error);
			return;
		}

		console.log('Tier order notification data:', {
			order: orderDetails,
			deliveryMethod: orderData.deliveryMethod,
			recipient: orderData.guestEmail || orderData.userId
		});

		// TODO: Implement actual email sending with NodeMailer
		// This would format the account details and deliver via chosen method
	} catch (error) {
		console.error('Error sending tier order notification:', error);
	}
}

/**
 * Get tier order details with allocated accounts
 */
export async function getTierOrderDetails(orderId: string) {
	try {
		const { data, error } = await supabase
			.from('orders')
			.select(
				`
				*,
				order_items (
					*,
					products (
						title,
						platform,
						tier_name,
						follower_count
					),
					accounts (
						username,
						password,
						email,
						additional_info
					)
				)
			`
			)
			.eq('id', orderId)
			.single();

		if (error) {
			console.error('Error fetching tier order details:', error);
			return null;
		}

		return data;
	} catch (error) {
		console.error('Error getting tier order details:', error);
		return null;
	}
}
