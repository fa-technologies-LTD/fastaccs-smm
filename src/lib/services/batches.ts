import { supabase } from '$lib/supabase';

// Types for batch management
export interface AccountBatch {
	id: string;
	category_id: string;
	supplier: string | null;
	cost_per_unit: number | null;
	descriptors: Record<string, unknown>;
	links_raw: string | null;
	logs_raw: string | null;
	notes: string | null;
	total_units: number;
	remaining_units: number;
	created_at: string;
}

export interface AccountBatchInsert {
	category_id: string;
	supplier?: string | null;
	cost_per_unit?: number | null;
	descriptors?: Record<string, unknown>;
	links_raw: string;
	logs_raw: string;
	notes?: string | null;
	total_units: number;
}

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
	batch_id: string;
	category_id: string;
	platform: string;
	link_url?: string | null;
	username?: string | null;
	password?: string | null;
	email?: string | null;
	email_password?: string | null;
	two_fa?: string | null;
	two_factor_enabled?: boolean | null;
	easy_login_enabled?: boolean | null;
	age_months?: number | null;
	niche?: string | null;
	quality_score?: number | null;
}

export interface ParsedAccount {
	link_url: string;
	username: string;
	password: string;
	email?: string;
	email_password?: string;
	two_fa?: string;
	two_factor_enabled?: boolean;
	easy_login_enabled?: boolean;
}

export interface ImportResult {
	success: boolean;
	batch_id?: string;
	imported_count: number;
	failed_count: number;
	errors: string[];
}

// Parse links from textarea input
export function parseLinks(linksText: string): string[] {
	return linksText
		.split('\n')
		.map((link) => link.trim())
		.filter((link) => link.length > 0);
}

// Parse credential blocks from textarea input
export function parseCredentialBlocks(credentialsText: string): ParsedAccount[] {
	const blocks = credentialsText.split('\n\n').filter((block) => block.trim());

	return blocks.map((block) => {
		const lines = block
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line);
		const account: ParsedAccount = {
			link_url: '',
			username: lines[0] || '',
			password: lines[1] || ''
		};

		// Parse additional fields intelligently
		for (let i = 2; i < lines.length; i++) {
			const line = lines[i];

			if (line.includes('@')) {
				account.email = line;
			} else if (line.includes('2FA') || line.includes('BACKUP')) {
				account.two_fa = line;
				account.two_factor_enabled = true;
			} else if (line.toLowerCase().includes('no_2fa')) {
				account.two_factor_enabled = false;
			} else if (line.toLowerCase().includes('easy_login=yes')) {
				account.easy_login_enabled = true;
			} else if (line.toLowerCase().includes('easy_login=no')) {
				account.easy_login_enabled = false;
			} else if (!account.email_password && line.length > 5) {
				// Assume it's email password if we already have email
				account.email_password = line;
			}
		}

		return account;
	});
}

// Validate import data
export function validateImportData(links: string[], accounts: ParsedAccount[]): string[] {
	const errors: string[] = [];

	if (links.length === 0) {
		errors.push('No links provided');
	}

	if (accounts.length === 0) {
		errors.push('No credential blocks provided');
	}

	if (links.length !== accounts.length) {
		errors.push(
			`Link count (${links.length}) doesn't match credential block count (${accounts.length})`
		);
	}

	// Validate each account has minimum required fields
	accounts.forEach((account, index) => {
		if (!account.username) {
			errors.push(`Account ${index + 1}: Missing username`);
		}
		if (!account.password) {
			errors.push(`Account ${index + 1}: Missing password`);
		}
	});

	return errors;
}

// Import batch with accounts
export async function importBatch(
	categoryId: string,
	platform: string,
	linksText: string,
	credentialsText: string,
	batchData: Partial<AccountBatchInsert> = {}
): Promise<ImportResult> {
	try {
		// Parse input data
		const links = parseLinks(linksText);
		const accounts = parseCredentialBlocks(credentialsText);

		// Validate data
		const errors = validateImportData(links, accounts);
		if (errors.length > 0) {
			return {
				success: false,
				imported_count: 0,
				failed_count: accounts.length,
				errors
			};
		}

		// Create batch record
		const { data: batch, error: batchError } = await supabase
			.from('account_batches')
			.insert({
				category_id: categoryId,
				links_raw: linksText,
				logs_raw: credentialsText,
				total_units: accounts.length,
				remaining_units: accounts.length,
				...batchData
			})
			.select()
			.single();

		if (batchError || !batch) {
			return {
				success: false,
				imported_count: 0,
				failed_count: accounts.length,
				errors: [`Failed to create batch: ${batchError?.message}`]
			};
		}

		// Create account records
		const accountInserts: AccountInsert[] = accounts.map((account, index) => ({
			batch_id: batch.id,
			category_id: categoryId,
			platform,
			link_url: links[index],
			username: account.username,
			password: account.password,
			email: account.email || null,
			email_password: account.email_password || null,
			two_fa: account.two_fa || null,
			two_factor_enabled: account.two_factor_enabled || null,
			easy_login_enabled: account.easy_login_enabled || null
		}));

		const { data: insertedAccounts, error: accountsError } = await supabase
			.from('accounts')
			.insert(accountInserts)
			.select();

		if (accountsError) {
			// Clean up batch if account insertion fails
			await supabase.from('account_batches').delete().eq('id', batch.id);

			return {
				success: false,
				imported_count: 0,
				failed_count: accounts.length,
				errors: [`Failed to create accounts: ${accountsError.message}`]
			};
		}

		return {
			success: true,
			batch_id: batch.id,
			imported_count: insertedAccounts?.length || 0,
			failed_count: 0,
			errors: []
		};
	} catch (error) {
		return {
			success: false,
			imported_count: 0,
			failed_count: 0,
			errors: [`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`]
		};
	}
}

// Get all batches in BatchMetadata format
export async function getBatches() {
	try {
		const { data, error } = await supabase
			.from('account_batches')
			.select(
				`
        *,
        tier:categories!inner(
          name,
          parent:categories(name)
        )
      `
			)
			.order('created_at', { ascending: false });

		if (error) return { data: null, error };

		// Convert to BatchMetadata format
		const batches: BatchMetadata[] = (data || []).map((batch) => {
			const descriptors = batch.descriptors as Record<string, unknown> | null;
			const status = descriptors?.status as string;

			return {
				id: batch.id,
				name: batch.supplier || 'Unnamed Batch',
				description: batch.notes,
				tier_id: batch.category_id,
				total_accounts: batch.total_units,
				processed_accounts: batch.total_units - batch.remaining_units,
				status:
					status === 'failed' ||
					status === 'pending' ||
					status === 'processing' ||
					status === 'completed'
						? status
						: 'pending',
				created_at: batch.created_at,
				updated_at: batch.created_at,
				metadata: descriptors || {}
			};
		});

		return { data: batches, error: null };
	} catch (error) {
		console.error('Error fetching batches:', error);
		return { data: null, error: { message: 'Failed to fetch batches' } };
	}
}

// Get batches by tier
export async function getBatchesByTier(categoryId: string) {
	const { data, error } = await supabase
		.from('account_batches')
		.select('*')
		.eq('category_id', categoryId)
		.order('created_at', { ascending: false });

	return { data, error };
}

// Get batch details with accounts
export async function getBatchDetails(batchId: string) {
	const { data: batch, error: batchError } = await supabase
		.from('account_batches')
		.select(
			`
      *,
      tier:categories!inner(
        name,
        parent:categories(name)
      )
    `
		)
		.eq('id', batchId)
		.single();

	if (batchError) return { data: null, error: batchError };

	const { data: accounts, error: accountsError } = await supabase
		.from('accounts')
		.select('*')
		.eq('batch_id', batchId)
		.order('created_at');

	return {
		data: { batch, accounts },
		error: accountsError
	};
}

// Additional types and functions for the new batch import system
export interface BatchMetadata {
	id: string;
	name: string;
	description?: string;
	tier_id: string;
	total_accounts: number;
	processed_accounts: number;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	created_at: string;
	updated_at: string;
	metadata?: {
		filename?: string;
		upload_date?: string;
		file_size?: number;
		headers?: string[];
	};
}

export interface BatchInsert {
	name: string;
	description?: string | null;
	tier_id: string;
	total_accounts: number;
	processed_accounts?: number;
	status?: 'pending' | 'processing' | 'completed' | 'failed';
	metadata?: Record<string, unknown>;
}

// Create new batch for import system
export async function createBatch(batchData: BatchInsert) {
	try {
		// Insert into account_batches table with compatible structure
		const { data, error } = await supabase
			.from('account_batches')
			.insert([
				{
					category_id: batchData.tier_id,
					supplier: batchData.name,
					total_units: batchData.total_accounts,
					remaining_units: batchData.total_accounts - (batchData.processed_accounts || 0),
					descriptors: {
						...(batchData.metadata || {}),
						status: batchData.status || 'pending'
					},
					notes: batchData.description
				}
			])
			.select()
			.single();

		if (error) return { data: null, error };

		// Return in BatchMetadata format
		const batchMetadata: BatchMetadata = {
			id: data.id,
			name: data.supplier || 'Unnamed Batch',
			description: data.notes,
			tier_id: data.category_id,
			total_accounts: data.total_units,
			processed_accounts: data.total_units - data.remaining_units,
			status: (['pending', 'processing', 'completed', 'failed'].includes(
				(data.descriptors as Record<string, unknown>)?.status as string
			)
				? (data.descriptors as Record<string, unknown>)?.status
				: 'pending') as 'pending' | 'processing' | 'completed' | 'failed',
			created_at: data.created_at,
			updated_at: data.created_at,
			metadata: (data.descriptors as Record<string, unknown>) || {}
		};

		return { data: batchMetadata, error: null };
	} catch (error) {
		console.error('Error creating batch:', error);
		return { data: null, error: { message: 'Failed to create batch' } };
	}
}

// Update batch status
export async function updateBatchStatus(id: string, status: string) {
	try {
		const { data, error } = await supabase
			.from('account_batches')
			.update({
				descriptors: { status }
			})
			.eq('id', id)
			.select()
			.single();

		return { data, error };
	} catch (error) {
		console.error('Error updating batch status:', error);
		return { data: null, error: { message: 'Failed to update batch status' } };
	}
}

// Get batch by ID in BatchMetadata format
export async function getBatchById(id: string) {
	try {
		const { data, error } = await supabase
			.from('account_batches')
			.select('*')
			.eq('id', id)
			.single();

		if (error) return { data: null, error };

		// Convert to BatchMetadata format
		const descriptors = data.descriptors as Record<string, unknown> | null;
		const status = descriptors?.status as string;

		const batch: BatchMetadata = {
			id: data.id,
			name: data.supplier || 'Unnamed Batch',
			description: data.notes,
			tier_id: data.category_id,
			total_accounts: data.total_units,
			processed_accounts: data.total_units - data.remaining_units,
			status:
				status === 'failed' ||
				status === 'pending' ||
				status === 'processing' ||
				status === 'completed'
					? status
					: 'pending',
			created_at: data.created_at,
			updated_at: data.created_at,
			metadata: descriptors || {}
		};

		return { data: batch, error: null };
	} catch (error) {
		console.error('Error fetching batch:', error);
		return { data: null, error: { message: 'Failed to fetch batch' } };
	}
}
