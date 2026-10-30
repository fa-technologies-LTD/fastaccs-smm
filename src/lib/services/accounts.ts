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
