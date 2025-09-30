import { supabase } from '$lib/supabase';

// Types for account management
export interface Account {
	id: string;
	batch_id: string;
	category_id: string;
	platform: string;
	link_url: string | null;
	username: string | null;
	password: string | null;
	email: string | null;
	email_password: string | null;
	two_fa: string | null;
	two_factor_enabled: boolean | null;
	easy_login_enabled: boolean | null;
	age_months: number | null;
	niche: string | null;
	quality_score: number | null;
	status: 'available' | 'reserved' | 'assigned' | 'delivered' | 'failed' | 'retired';
	reserved_until: string | null;
	order_item_id: string | null;
	delivered_at: string | null;
	delivery_notes: string | null;
	created_at: string;
}

export interface AccountInsert {
	id?: string;
	batch_id: string;
	category_id?: string;
	tier_id?: string;
	platform?: string;
	link_url?: string | null;
	username: string;
	password?: string | null;
	email?: string | null;
	email_password?: string | null;
	two_fa?: string | null;
	two_factor_enabled?: boolean | null;
	easy_login_enabled?: boolean | null;
	age_months?: number | null;
	niche?: string | null;
	quality_score?: number | null;
	status?: 'available' | 'reserved' | 'assigned' | 'delivered' | 'failed' | 'retired';
	followers?: number;
	engagement_rate?: number;
	price?: number;
}

export interface AccountUpdate {
	status?: 'available' | 'reserved' | 'assigned' | 'delivered' | 'failed' | 'retired';
	reserved_until?: string | null;
	order_item_id?: string | null;
	delivered_at?: string | null;
	delivery_notes?: string | null;
	quality_score?: number | null;
}

// Get accounts by tier
export async function getAccountsByTier(categoryId: string) {
	const { data, error } = await supabase
		.from('accounts')
		.select(
			`
      *,
      batch:account_batches(id, supplier, created_at)
    `
		)
		.eq('category_id', categoryId)
		.order('created_at');

	return { data, error };
}

// Get accounts by status
export async function getAccountsByStatus(status: Account['status']) {
	const { data, error } = await supabase
		.from('accounts')
		.select(
			`
      *,
      category:categories!category_id(
        name,
        parent:categories(name)
      )
    `
		)
		.eq('status', status)
		.order('created_at');

	return { data, error };
}

// Get available accounts for allocation (FIFO)
export async function getAvailableAccounts(categoryId: string, limit: number) {
	const { data, error } = await supabase
		.from('accounts')
		.select('*')
		.eq('category_id', categoryId)
		.eq('status', 'available')
		.is('reserved_until', null)
		.order('created_at') // FIFO - oldest first
		.limit(limit);

	return { data, error };
}

// Update account status
export async function updateAccount(id: string, updates: AccountUpdate) {
	const { data, error } = await supabase
		.from('accounts')
		.update(updates)
		.eq('id', id)
		.select()
		.single();

	return { data, error };
}

// Reserve accounts for cart (soft hold)
export async function reserveAccounts(categoryId: string, quantity: number) {
	const expiresAt = new Date();
	expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30-minute hold

	// Get available accounts
	const { data: accounts, error: fetchError } = await getAvailableAccounts(categoryId, quantity);

	if (fetchError || !accounts || accounts.length < quantity) {
		return {
			data: null,
			error: { message: `Only ${accounts?.length || 0} accounts available, need ${quantity}` }
		};
	}

	// Update accounts to reserved status
	const accountIds = accounts.map((a) => a.id);
	const { data, error } = await supabase
		.from('accounts')
		.update({
			status: 'reserved',
			reserved_until: expiresAt.toISOString()
		})
		.in('id', accountIds)
		.select();

	return { data, error };
}

// Release reserved accounts (expired or cancelled)
export async function releaseReservedAccounts(accountIds: string[]) {
	const { data, error } = await supabase
		.from('accounts')
		.update({
			status: 'available',
			reserved_until: null
		})
		.in('id', accountIds)
		.eq('status', 'reserved')
		.select();

	return { data, error };
}

// Assign accounts to order (atomic allocation)
export async function assignAccountsToOrder(
	categoryId: string,
	quantity: number,
	orderItemId: string
) {
	// This uses the database function for atomic allocation
	const { error } = await supabase.rpc('allocate_accounts_for_order_item', {
		p_order_item_id: orderItemId
	});

	if (error) {
		return { data: null, error };
	}

	// Get the assigned accounts
	const { data, error: fetchError } = await supabase
		.from('accounts')
		.select('*')
		.eq('order_item_id', orderItemId)
		.eq('status', 'assigned');

	return { data, error: fetchError };
}

// Mark accounts as delivered
export async function markAccountsDelivered(accountIds: string[], deliveryNotes?: string) {
	const { data, error } = await supabase
		.from('accounts')
		.update({
			status: 'delivered',
			delivered_at: new Date().toISOString(),
			delivery_notes: deliveryNotes || null
		})
		.in('id', accountIds)
		.select();

	return { data, error };
}

// Mark accounts as failed
export async function markAccountsFailed(accountIds: string[], reason?: string) {
	const { data, error } = await supabase
		.from('accounts')
		.update({
			status: 'failed',
			delivery_notes: reason || null
		})
		.in('id', accountIds)
		.select();

	return { data, error };
}

// Retire accounts (remove from circulation)
export async function retireAccounts(accountIds: string[], reason?: string) {
	const { data, error } = await supabase
		.from('accounts')
		.update({
			status: 'retired',
			delivery_notes: reason || null
		})
		.in('id', accountIds)
		.select();

	return { data, error };
}

// Get account statistics
export async function getAccountStats() {
	const { data, error } = await supabase.from('accounts').select('status, category_id');

	if (error) return { data: null, error };

	const stats = {
		total: data.length,
		available: data.filter((a) => a.status === 'available').length,
		reserved: data.filter((a) => a.status === 'reserved').length,
		assigned: data.filter((a) => a.status === 'assigned').length,
		delivered: data.filter((a) => a.status === 'delivered').length,
		failed: data.filter((a) => a.status === 'failed').length,
		retired: data.filter((a) => a.status === 'retired').length
	};

	return { data: stats, error: null };
}

// Clean up expired reservations
export async function cleanupExpiredReservations() {
	const { data, error } = await supabase.rpc('cleanup_expired_reservations');
	return { data, error };
}

// Upload accounts in batch
export async function uploadAccountsBatch(batchId: string, accounts: Partial<AccountInsert>[]) {
	try {
		// Add batch_id to each account (let database generate UUIDs)
		const accountsWithBatchId = accounts.map((account) => ({
			...account,
			batch_id: batchId
		}));

		const { data, error } = await supabase.from('accounts').insert(accountsWithBatchId).select();

		return { data, error };
	} catch (error) {
		console.error('Error uploading accounts batch:', error);
		return { data: null, error: { message: 'Failed to upload accounts batch' } };
	}
}

// Get accounts by batch ID
export async function getAccountsByBatch(batchId: string) {
	try {
		const { data, error } = await supabase
			.from('accounts')
			.select('*')
			.eq('batch_id', batchId)
			.order('created_at', { ascending: false });

		return { data, error };
	} catch (error) {
		console.error('Error fetching accounts by batch:', error);
		return { data: null, error: { message: 'Failed to fetch accounts' } };
	}
}

// Add AccountMetadata type export
export interface AccountMetadata {
	id: string;
	batch_id: string;
	tier_id: string;
	username: string;
	display_name?: string;
	platform?: string;
	followers?: number;
	engagement_rate?: number;
	status: string;
	price?: number;
	created_at: string;
	updated_at: string;
}
