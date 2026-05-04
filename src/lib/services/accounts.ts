// Helper function to handle API responses
async function handleApiCall(response: Response) {
	if (!response.ok) {
		return { data: null, error: `HTTP ${response.status}: ${response.statusText}` };
	}
	return await response.json();
}

// Types for account management - keep the original types
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
	followers: number | null;
	following: number | null;
	posts_count: number | null;
	engagement_rate: number | null;
	age_months: number | null;
	niche: string | null;
	quality_score: number | null;
	credential_extras: Record<string, string> | null;
	status: 'available' | 'reserved' | 'allocated' | 'delivered' | 'failed' | 'retired';
	reserved_until: string | null;
	order_item_id: string | null;
	delivered_at: string | null;
	delivery_notes: string | null;
	created_at: string;
}

// Alias for compatibility with existing code
export type AccountMetadata = Account;

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
	credentialExtras?: Record<string, string> | null;
	credential_extras?: Record<string, string> | null;
	status?: 'available' | 'reserved' | 'allocated' | 'delivered' | 'failed' | 'retired';
	followers?: number;
	engagement_rate?: number;
	price?: number;
}

export interface AccountUpdate {
	batch_id?: string;
	category_id?: string;
	platform?: string;
	link_url?: string | null;
	username?: string;
	password?: string | null;
	email?: string | null;
	email_password?: string | null;
	two_fa?: string | null;
	two_factor_enabled?: boolean | null;
	easy_login_enabled?: boolean | null;
	age_months?: number | null;
	niche?: string | null;
	quality_score?: number | null;
	credentialExtras?: Record<string, string> | null;
	credential_extras?: Record<string, string> | null;
	status?: 'available' | 'reserved' | 'allocated' | 'delivered' | 'failed' | 'retired';
	reserved_until?: string | null;
	order_item_id?: string | null;
	delivered_at?: string | null;
	delivery_notes?: string | null;
}

// Get accounts by tier
export async function getAccountsByTier(categoryId: string) {
	try {
		const response = await fetch(`/api/accounts?categoryId=${categoryId}`);
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fetch accounts by tier:', error);
		return { data: null, error: 'Failed to fetch accounts by tier' };
	}
}

// Get all accounts with optional filters
export async function getAccounts(
	filters: {
		status?: string;
		platform?: string;
		batchId?: string;
		categoryId?: string;
	} = {}
) {
	try {
		const params = new URLSearchParams();
		if (filters.status) params.append('status', filters.status);
		if (filters.platform) params.append('platform', filters.platform);
		if (filters.batchId) params.append('batchId', filters.batchId);
		if (filters.categoryId) params.append('categoryId', filters.categoryId);

		const response = await fetch(`/api/accounts?${params.toString()}`);
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fetch accounts:', error);
		return { data: null, error: 'Failed to fetch accounts' };
	}
}

// Create account
export async function createAccount(account: AccountInsert) {
	try {
		const response = await fetch('/api/accounts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(account)
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to create account:', error);
		return { data: null, error: 'Failed to create account' };
	}
}

// Update account
export async function updateAccount(id: string, updates: AccountUpdate) {
	try {
		const response = await fetch(`/api/accounts/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updates)
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to update account:', error);
		return { data: null, error: 'Failed to update account' };
	}
}

// Delete account
export async function deleteAccount(id: string) {
	try {
		const response = await fetch(`/api/accounts/${id}`, {
			method: 'DELETE'
		});
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to delete account:', error);
		return { data: null, error: 'Failed to delete account' };
	}
}

// Get available accounts by tier
export async function getAvailableAccountsByTier(categoryId: string) {
	try {
		const response = await fetch(`/api/accounts?categoryId=${categoryId}&status=available`);
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fetch available accounts:', error);
		return { data: null, error: 'Failed to fetch available accounts' };
	}
}

// Get accounts by batch ID
export async function getAccountsByBatch(batchId: string, fetchFn: typeof fetch = fetch) {
	try {
		const response = await fetchFn(`/api/accounts?batchId=${batchId}`);
		return await handleApiCall(response);
	} catch (error) {
		console.error('Failed to fetch accounts by batch:', error);
		return { data: null, error: 'Failed to fetch accounts by batch' };
	}
}

// Note: Complex functions like allocateAccountsForOrderItem and RPC calls
// will need specific API endpoints created for them.
