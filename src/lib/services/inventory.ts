import type { Account, Category } from '@prisma/client';

// Account with platform/tier category information
export interface AccountInventory extends Account {
	category: Category & {
		parent?: Category;
	};
}

// Platform/tier inventory summary for admin dashboard
export interface InventoryByPlatform {
	platform: string;
	tier: string;
	categoryId: string;
	total_accounts: number;
	available_accounts: number;
	assigned_accounts: number;
	delivered_accounts: number;
	price: number;
	status: 'in_stock' | 'low_stock' | 'out_of_stock';
	last_restocked?: Date;
}

// Overall inventory statistics
export interface InventoryStats {
	total_accounts: number;
	available_accounts: number;
	assigned_accounts: number;
	delivered_accounts: number;
	platforms: number;

	total_tiers: number;
	total_available: number;
	total_reserved: number;
	out_of_stock: number;
	low_stock: number;

	accountsInOutOfStockTiers: number;
	outOfStockTiersCount: number;
}

// Data for creating new accounts during import
export interface CreateAccountData {
	categoryId: string;
	username: string;
	email?: string;
	password?: string;
	followers: number;
	engagement?: number;
	verified: boolean;
	price: number;
	currency: string;
	status: string;
	metadata?: Record<string, unknown>;
}

/**
 * Get inventory organized by platform/tier for admin dashboard
 */
export async function getInventoryByPlatforms(): Promise<{
	data: InventoryByPlatform[] | null;
	error?: string;
}> {
	try {
		const response = await fetch('/api/inventory');
		if (!response.ok) {
			const errorText = await response.text();
			return { data: null, error: `HTTP ${response.status}: ${errorText}` };
		}
		const data = await response.json();
		return { data: data.data || data };
	} catch (error) {
		console.error('Failed to fetch inventory:', error);
		return { data: null, error: 'Failed to fetch inventory' };
	}
}

/**
 * Get overall inventory statistics
 */
export async function getInventoryStats(): Promise<{
	data: InventoryStats | null;
	error?: string;
}> {
	try {
		const response = await fetch('/api/inventory/stats');
		if (!response.ok) {
			const errorText = await response.text();
			return { data: null, error: `HTTP ${response.status}: ${errorText}` };
		}
		const data = await response.json();
		return { data: data.data || data };
	} catch (error) {
		console.error('Failed to fetch inventory stats:', error);
		return { data: null, error: 'Failed to fetch inventory stats' };
	}
}

/**
 * Get accounts with filtering
 */
export async function getAccounts(
	options: {
		categoryId?: string;
		status?: string;
		platform?: string;
		page?: number;
		limit?: number;
	} = {}
): Promise<{ data: AccountInventory[] | null; error?: string }> {
	try {
		const searchParams = new URLSearchParams();
		if (options.categoryId) searchParams.set('categoryId', options.categoryId);
		if (options.status) searchParams.set('status', options.status);
		if (options.platform) searchParams.set('platform', options.platform);
		if (options.page) searchParams.set('page', options.page.toString());
		if (options.limit) searchParams.set('limit', options.limit.toString());

		const response = await fetch(`/api/inventory/accounts?${searchParams.toString()}`);
		if (!response.ok) {
			const errorText = await response.text();
			return { data: null, error: `HTTP ${response.status}: ${errorText}` };
		}
		const data = await response.json();
		return { data: data.data || data };
	} catch (error) {
		console.error('Failed to fetch accounts:', error);
		return { data: null, error: 'Failed to fetch accounts' };
	}
}

/**
 * Get single account by ID
 */
export async function getAccountById(
	accountId: string
): Promise<{ data: AccountInventory | null; error?: string }> {
	try {
		const response = await fetch(`/api/inventory/accounts/${accountId}`);
		if (!response.ok) {
			const errorText = await response.text();
			return { data: null, error: `HTTP ${response.status}: ${errorText}` };
		}
		const data = await response.json();
		return { data: data.data || data };
	} catch (error) {
		console.error('Failed to fetch account:', error);
		return { data: null, error: 'Failed to fetch account' };
	}
}

/**
 * Create new account (admin import)
 */
export async function createAccount(
	accountData: CreateAccountData
): Promise<{ data: Account | null; error?: string }> {
	try {
		const response = await fetch('/api/inventory/accounts', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(accountData)
		});
		if (!response.ok) {
			const errorText = await response.text();
			return { data: null, error: `HTTP ${response.status}: ${errorText}` };
		}
		const data = await response.json();
		return { data: data.data || data };
	} catch (error) {
		console.error('Failed to create account:', error);
		return { data: null, error: 'Failed to create account' };
	}
}

/**
 * Update account
 */
export async function updateAccount(
	accountId: string,
	updates: Partial<CreateAccountData>
): Promise<{ data: Account | null; error?: string }> {
	try {
		const response = await fetch(`/api/inventory/accounts/${accountId}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(updates)
		});
		if (!response.ok) {
			const errorText = await response.text();
			return { data: null, error: `HTTP ${response.status}: ${errorText}` };
		}
		const data = await response.json();
		return { data: data.data || data };
	} catch (error) {
		console.error('Failed to update account:', error);
		return { data: null, error: 'Failed to update account' };
	}
}

/**
 * Update account status (available → assigned → delivered)
 */
export async function updateAccountStatus(
	accountId: string,
	status: string
): Promise<{ data: Account | null; error?: string }> {
	try {
		const response = await fetch(`/api/inventory/accounts/${accountId}/status`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ status })
		});
		if (!response.ok) {
			const errorText = await response.text();
			return { data: null, error: `HTTP ${response.status}: ${errorText}` };
		}
		const data = await response.json();
		return { data: data.data || data };
	} catch (error) {
		console.error('Failed to update account status:', error);
		return { data: null, error: 'Failed to update account status' };
	}
}

/**
 * Delete account
 */
export async function deleteAccount(
	accountId: string
): Promise<{ data: boolean | null; error?: string }> {
	try {
		const response = await fetch(`/api/inventory/accounts/${accountId}`, {
			method: 'DELETE'
		});
		if (!response.ok) {
			const errorText = await response.text();
			return { data: null, error: `HTTP ${response.status}: ${errorText}` };
		}
		return { data: true };
	} catch (error) {
		console.error('Failed to delete account:', error);
		return { data: null, error: 'Failed to delete account' };
	}
}

/**
 * Assign accounts to an order (available → assigned)
 */
export async function assignAccountsToOrder(
	orderId: string,
	categoryId: string,
	quantity: number
): Promise<{ data: Account[] | null; error?: string }> {
	try {
		const response = await fetch(`/api/orders/${orderId}/assign`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ categoryId, quantity })
		});
		if (!response.ok) {
			const errorText = await response.text();
			return { data: null, error: `HTTP ${response.status}: ${errorText}` };
		}
		const data = await response.json();
		return { data: data.data || data };
	} catch (error) {
		console.error('Failed to assign accounts to order:', error);
		return { data: null, error: 'Failed to assign accounts to order' };
	}
}

/**
 * Mark accounts as delivered (assigned → delivered)
 */
export async function markAccountsDelivered(
	accountIds: string[]
): Promise<{ data: boolean | null; error?: string }> {
	try {
		const response = await fetch('/api/inventory/deliver', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ accountIds })
		});
		if (!response.ok) {
			const errorText = await response.text();
			return { data: null, error: `HTTP ${response.status}: ${errorText}` };
		}
		return { data: true };
	} catch (error) {
		console.error('Failed to mark accounts as delivered:', error);
		return { data: null, error: 'Failed to mark accounts as delivered' };
	}
}
