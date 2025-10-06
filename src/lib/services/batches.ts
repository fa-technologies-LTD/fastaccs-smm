// Types for batch management (updated for Prisma)
export interface AccountBatch {
	id: string;
	categoryId: string;
	supplier: string | null;
	costPerUnit: number | null;
	descriptors: Record<string, unknown>;
	linksRaw: string | null;
	logsRaw: string | null;
	notes: string | null;
	totalUnits: number;
	remainingUnits: number;
	createdAt: string;
	updatedAt: string;
}

export interface AccountBatchInsert {
	categoryId: string;
	supplier?: string | null;
	costPerUnit?: number | null;
	descriptors?: Record<string, unknown>;
	linksRaw: string;
	logsRaw: string;
	notes?: string | null;
	totalUnits: number;
}

export interface Account {
	id: string;
	batchId: string;
	categoryId: string;
	platform: string;
	linkUrl: string | null;
	username: string | null;
	password: string | null;
	email: string | null;
	emailPassword: string | null;
	twoFa: string | null;
	twoFactorEnabled: boolean | null;
	easyLoginEnabled: boolean | null;
	ageMonths: number | null;
	niche: string | null;
	qualityScore: number | null;
	status: 'available' | 'reserved' | 'assigned' | 'delivered' | 'failed' | 'retired';
	reservedUntil: string | null;
	orderItemId: string | null;
	deliveredAt: string | null;
	deliveryNotes: string | null;
	createdAt: string;
}

export interface AccountInsert {
	batchId: string;
	categoryId: string;
	platform: string;
	linkUrl?: string | null;
	username?: string | null;
	password?: string | null;
	email?: string | null;
	emailPassword?: string | null;
	twoFa?: string | null;
	twoFactorEnabled?: boolean | null;
	easyLoginEnabled?: boolean | null;
	ageMonths?: number | null;
	niche?: string | null;
	qualityScore?: number | null;
}

export interface ParsedAccount {
	linkUrl: string;
	username: string;
	password: string;
	email?: string;
	emailPassword?: string;
	twoFa?: string;
	twoFactorEnabled?: boolean;
	easyLoginEnabled?: boolean;
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
			linkUrl: '',
			username: lines[0] || '',
			password: lines[1] || ''
		};

		// Parse additional fields intelligently
		for (let i = 2; i < lines.length; i++) {
			const line = lines[i];

			if (line.includes('@')) {
				account.email = line;
			} else if (line.includes('2FA') || line.includes('BACKUP')) {
				account.twoFa = line;
				account.twoFactorEnabled = true;
			} else if (line.toLowerCase().includes('no_2fa')) {
				account.twoFactorEnabled = false;
			} else if (line.toLowerCase().includes('easy_login=yes')) {
				account.easyLoginEnabled = true;
			} else if (line.toLowerCase().includes('easy_login=no')) {
				account.easyLoginEnabled = false;
			} else if (!account.emailPassword && line.length > 5) {
				// Assume it's email password if we already have email
				account.emailPassword = line;
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
	batchData: Partial<AccountBatchInsert> = {},
	fetchFn = fetch
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
		const batchResponse = await fetchFn('/api/batches', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				categoryId: categoryId,
				linksRaw: linksText,
				logsRaw: credentialsText,
				totalUnits: accounts.length,
				remainingUnits: accounts.length,
				...batchData
			})
		});

		const batchResult = await batchResponse.json();
		if (!batchResponse.ok || batchResult.error) {
			return {
				success: false,
				imported_count: 0,
				failed_count: accounts.length,
				errors: [`Failed to create batch: ${batchResult.error}`]
			};
		}

		const batch = batchResult.data;

		// Create account records
		const accountInserts: AccountInsert[] = accounts.map((account, index) => ({
			batchId: batch.id,
			categoryId: categoryId,
			platform,
			linkUrl: links[index],
			username: account.username,
			password: account.password,
			email: account.email || null,
			emailPassword: account.emailPassword || null,
			twoFa: account.twoFa || null,
			twoFactorEnabled: account.twoFactorEnabled || null,
			easyLoginEnabled: account.easyLoginEnabled || null
		}));

		// Create accounts in batch
		let insertedCount = 0;
		const accountErrors: string[] = [];

		for (let i = 0; i < accountInserts.length; i++) {
			try {
				const accountResponse = await fetchFn('/api/accounts', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(accountInserts[i])
				});

				const accountResult = await accountResponse.json();
				if (accountResponse.ok && !accountResult.error) {
					insertedCount++;
				} else {
					accountErrors.push(`Account ${i + 1}: ${accountResult.error}`);
				}
			} catch (error) {
				accountErrors.push(
					`Account ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		}

		if (accountErrors.length > 0 && insertedCount === 0) {
			// Clean up batch if no accounts were inserted
			await fetchFn(`/api/batches/${batch.id}`, {
				method: 'DELETE'
			});

			return {
				success: false,
				imported_count: 0,
				failed_count: accounts.length,
				errors: [`Failed to create accounts:`, ...accountErrors]
			};
		}

		return {
			success: true,
			batch_id: batch.id,
			imported_count: insertedCount,
			failed_count: accountErrors.length,
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
export async function getBatches(fetchFn: typeof fetch = fetch) {
	try {
		const response = await fetchFn('/api/batches');
		const result = await response.json();

		if (result.error) {
			return { data: null, error: result.error };
		}

		// Convert to BatchMetadata format
		const batches: BatchMetadata[] = (result.data || []).map((batch: Record<string, unknown>) => {
			const descriptors = batch.descriptors as Record<string, unknown> | null;
			const status = descriptors?.status as string;
			const totalUnits = (batch.totalUnits as number) || 0;
			const remainingUnits = (batch.remainingUnits as number) || 0;

			return {
				id: batch.id as string,
				name: (batch.supplier as string) || 'Unnamed Batch',
				description: batch.notes as string,
				tier_id: batch.categoryId as string,
				total_accounts: totalUnits,
				processed_accounts: totalUnits - remainingUnits,
				status:
					status === 'failed' ||
					status === 'pending' ||
					status === 'processing' ||
					status === 'completed'
						? status
						: 'pending',
				created_at: batch.createdAt as string,
				updated_at: batch.updatedAt as string,
				metadata: descriptors || {}
			};
		});

		return { data: batches, error: null };
	} catch (error) {
		console.error('Error fetching batches:', error);
		return { data: null, error: 'Failed to fetch batches' };
	}
}

// Get batches by tier
export async function getBatchesByTier(categoryId: string, fetchFn = fetch) {
	try {
		const response = await fetchFn(`/api/batches?categoryId=${encodeURIComponent(categoryId)}`);
		const result = await response.json();

		if (result.error) {
			return { data: null, error: result.error };
		}

		return { data: result.data, error: null };
	} catch (error) {
		console.error('Error fetching batches by tier:', error);
		return { data: null, error: 'Failed to fetch batches' };
	}
}

// Get batch details with accounts
export async function getBatchDetails(batchId: string, fetchFn: typeof fetch = fetch) {
	try {
		const response = await fetchFn(`/api/batches/${batchId}`);
		const result = await response.json();

		if (result.error) {
			return { data: null, error: result.error };
		}

		// Get accounts for this batch
		const accountsResponse = await fetchFn(`/api/accounts?batchId=${batchId}`);
		const accountsResult = await accountsResponse.json();

		return {
			data: {
				batch: result.data,
				accounts: accountsResult.data || []
			},
			error: accountsResult.error
		};
	} catch (error) {
		console.error('Error fetching batch details:', error);
		return { data: null, error: 'Failed to fetch batch details' };
	}
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
export async function createBatch(batchData: BatchInsert, fetchFn: typeof fetch = fetch) {
	try {
		const response = await fetchFn('/api/batches', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				categoryId: batchData.tier_id,
				supplier: batchData.name,
				totalUnits: batchData.total_accounts,
				remainingUnits: batchData.total_accounts - (batchData.processed_accounts || 0),
				descriptors: {
					...(batchData.metadata || {}),
					status: batchData.status || 'pending'
				},
				notes: batchData.description
			})
		});

		const result = await response.json();

		if (result.error) return { data: null, error: result.error };

		// Return in BatchMetadata format
		const data = result.data;
		const batchMetadata: BatchMetadata = {
			id: data.id,
			name: data.supplier || 'Unnamed Batch',
			description: data.notes,
			tier_id: data.categoryId,
			total_accounts: data.totalUnits,
			processed_accounts: data.totalUnits - data.remainingUnits,
			status: (['pending', 'processing', 'completed', 'failed'].includes(
				(data.descriptors as Record<string, unknown>)?.status as string
			)
				? (data.descriptors as Record<string, unknown>)?.status
				: 'pending') as 'pending' | 'processing' | 'completed' | 'failed',
			created_at: data.createdAt,
			updated_at: data.updatedAt,
			metadata: (data.descriptors as Record<string, unknown>) || {}
		};

		return { data: batchMetadata, error: null };
	} catch (error) {
		console.error('Error creating batch:', error);
		return { data: null, error: 'Failed to create batch' };
	}
}

// Update batch status
export async function updateBatchStatus(id: string, status: string, fetchFn = fetch) {
	try {
		// If status is completed, also update remainingUnits to 0
		const updateData: { descriptors: { status: string }; remainingUnits?: number } = {
			descriptors: { status }
		};

		if (status === 'completed') {
			updateData.remainingUnits = 0;
		}

		const response = await fetchFn(`/api/batches/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updateData)
		});

		const result = await response.json();

		if (result.error) {
			return { data: null, error: result.error };
		}

		return { data: result.data, error: null };
	} catch (error) {
		console.error('Error updating batch status:', error);
		return { data: null, error: { message: 'Failed to update batch status' } };
	}
}

// Get batch by ID in BatchMetadata format
export async function getBatchById(id: string, fetchFn: typeof fetch = fetch) {
	try {
		const response = await fetchFn(`/api/batches/${id}`);
		const result = await response.json();

		if (result.error) return { data: null, error: result.error };

		const data = result.data;

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
